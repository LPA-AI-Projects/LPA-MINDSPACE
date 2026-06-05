-- Quick fix: "column reference session_id is ambiguous" in bootstrap_training_session.
-- Run this alone in Supabase SQL Editor (RLS on/off does not matter for this bug).

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
