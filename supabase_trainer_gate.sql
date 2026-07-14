-- Gate session bootstrap/create to shared trainer emails only.
-- 1) Create the shared trainer user in Supabase Auth (Authentication → Users).
-- 2) Insert that email below (and set VITE_TRAINER_EMAILS in .env to match).
-- 3) Run this in the Supabase SQL Editor.

create table if not exists public.app_trainers (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.app_trainers enable row level security;

drop policy if exists app_trainers_select_authenticated on public.app_trainers;
create policy app_trainers_select_authenticated on public.app_trainers
for select
to authenticated
using (true);

-- Seed the shared trainer account (edit to your real email).
insert into public.app_trainers (email)
values ('trainer@learnerspoint.com')
on conflict (email) do nothing;

create or replace function public.is_app_trainer(p_email text default null)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.app_trainers t
    where lower(t.email) = lower(coalesce(p_email, auth.jwt() ->> 'email'))
  );
$$;

grant execute on function public.is_app_trainer(text) to authenticated;

create or replace function public.bootstrap_training_session(p_session_id text)
returns table (
  session_id text,
  board_id bigint,
  created_by uuid,
  facilitator_ids uuid[],
  status text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_board_id bigint;
  v_existing public.sessions%rowtype;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if v_email = '' or not public.is_app_trainer(v_email) then
    raise exception 'only the shared trainer account can create sessions';
  end if;

  select * into v_existing
  from public.sessions s
  where s.id = p_session_id;

  if found then
    return query
    select
      v_existing.id as session_id,
      v_existing.board_id,
      v_existing.created_by,
      v_existing.facilitator_ids,
      v_existing.status;
    return;
  end if;

  insert into public.boards (user_id, state)
  values (v_user, '{}'::jsonb)
  returning id into v_board_id;

  insert into public.sessions (id, board_id, created_by, facilitator_ids, status, is_reusable)
  values (p_session_id, v_board_id, v_user, array[v_user], 'active', true);

  insert into public.session_participants (session_id, user_id, role, can_override_workspace)
  values (p_session_id, v_user, 'facilitator', true)
  on conflict (session_id, user_id) do update
    set role = 'facilitator',
        can_override_workspace = true,
        last_seen_at = now();

  return query
  select
    s.id as session_id,
    s.board_id,
    s.created_by,
    s.facilitator_ids,
    s.status
  from public.sessions s
  where s.id = p_session_id;
end;
$$;

grant execute on function public.bootstrap_training_session(text) to authenticated;
