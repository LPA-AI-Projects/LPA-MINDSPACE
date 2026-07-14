-- Fix: students got "Session not found" on a valid share link.
-- Cause: RLS only let existing members read sessions, so first-time joins failed.
-- Run in Supabase SQL Editor.

create or replace function public.lookup_session_for_join(p_session_id text)
returns table (
  id text,
  board_id bigint,
  created_by uuid,
  facilitator_ids uuid[],
  status text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return query
  select
    s.id,
    s.board_id,
    s.created_by,
    s.facilitator_ids,
    s.status
  from public.sessions s
  where s.id = p_session_id;
end;
$$;

grant execute on function public.lookup_session_for_join(text) to authenticated;

-- Let authenticated users see ACTIVE sessions (needed to join via share link).
-- Members / creators can still see their sessions in any status.
drop policy if exists sessions_select on public.sessions;
drop policy if exists sessions_select_closed_members on public.sessions;
create policy sessions_select on public.sessions
for select
using (
  created_by = auth.uid()
  or auth.uid() = any(facilitator_ids)
  or public.is_session_participant(id)
  or lower(coalesce(status, 'active')) = 'active'
);
