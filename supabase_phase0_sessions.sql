-- Phase 0 foundation for session-based collaboration (1 session = 1 board).
-- Apply in Supabase SQL Editor.

create table if not exists public.sessions (
  id text primary key,
  board_id bigint not null references public.boards(id) on delete cascade,
  created_by uuid not null,
  facilitator_ids uuid[] not null default '{}',
  status text not null default 'active',
  is_reusable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_participants (
  session_id text not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'participant',
  can_override_workspace boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists idx_session_participants_session on public.session_participants(session_id);
create index if not exists idx_sessions_board on public.sessions(board_id);

alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;

-- Security definer helpers avoid RLS recursion between sessions and session_participants.
create or replace function public.is_session_participant(p_session_id text, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.session_participants sp
    where sp.session_id = p_session_id
      and sp.user_id = p_user_id
  );
$$;

create or replace function public.is_session_facilitator(p_session_id text, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and (
        s.created_by = p_user_id
        or p_user_id = any(s.facilitator_ids)
      )
  );
$$;

create or replace function public.user_can_access_board(p_board_id bigint, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.boards b
    where b.id = p_board_id
      and (
        b.user_id = p_user_id
        or exists (
          select 1
          from public.sessions s
          where s.board_id = b.id
            and (
              s.created_by = p_user_id
              or p_user_id = any(s.facilitator_ids)
              or public.is_session_participant(s.id, p_user_id)
            )
        )
      )
  );
$$;

create or replace function public.user_can_edit_board(p_board_id bigint, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.boards b
    where b.id = p_board_id
      and (
        b.user_id = p_user_id
        or exists (
          select 1
          from public.sessions s
          join public.session_participants sp
            on sp.session_id = s.id
           and sp.user_id = p_user_id
          where s.board_id = b.id
            and sp.role in ('facilitator', 'participant')
        )
      )
  );
$$;

grant execute on function public.is_session_participant(text, uuid) to authenticated;
grant execute on function public.is_session_facilitator(text, uuid) to authenticated;
grant execute on function public.user_can_access_board(bigint, uuid) to authenticated;
grant execute on function public.user_can_edit_board(bigint, uuid) to authenticated;

-- Session visibility: participants or facilitators can read session.
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
for select
using (
  created_by = auth.uid()
  or auth.uid() = any(facilitator_ids)
  or public.is_session_participant(id)
);

-- Session creation by authenticated users.
drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions
for insert
with check (auth.uid() is not null and created_by = auth.uid());

-- Session update by facilitators/creator.
drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions
for update
using (
  created_by = auth.uid()
  or auth.uid() = any(facilitator_ids)
);

-- Participants can read participants in sessions they are part of.
drop policy if exists session_participants_select on public.session_participants;
create policy session_participants_select on public.session_participants
for select
using (
  user_id = auth.uid()
  or public.is_session_participant(session_id)
  or public.is_session_facilitator(session_id)
);

-- User can upsert their own participant row.
drop policy if exists session_participants_insert on public.session_participants;
create policy session_participants_insert on public.session_participants
for insert
with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists session_participants_update on public.session_participants;
create policy session_participants_update on public.session_participants
for update
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.sessions s
    where s.id = session_participants.session_id
      and (s.created_by = auth.uid() or auth.uid() = any(s.facilitator_ids))
  )
);

-- Role guardrail.
alter table public.session_participants
  drop constraint if exists session_participants_role_check;
alter table public.session_participants
  add constraint session_participants_role_check
  check (role in ('facilitator', 'participant'));

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sessions_touch_updated_at on public.sessions;
create trigger trg_sessions_touch_updated_at
before update on public.sessions
for each row execute function public.touch_updated_at();

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
  v_board_id bigint;
  v_existing public.sessions%rowtype;
begin
  if v_user is null then
    raise exception 'not authenticated';
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
    set last_seen_at = now();

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

-- Boards: session members can read/edit the session board (not only the owner).
alter table public.boards enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'boards'
  loop
    execute format('drop policy if exists %I on public.boards', pol.policyname);
  end loop;
end $$;

create policy boards_select_own on public.boards
for select
using (user_id = auth.uid());

create policy boards_select_session on public.boards
for select
using (public.user_can_access_board(id));

create policy boards_insert_own on public.boards
for insert
with check (auth.uid() is not null and user_id = auth.uid());

create policy boards_update_own on public.boards
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy boards_update_session on public.boards
for update
using (public.user_can_edit_board(id))
with check (public.user_can_edit_board(id));
