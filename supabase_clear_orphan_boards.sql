-- Clear leftover boards that are not linked to any session
-- (personal boards / orphans from earlier testing).
-- Run after sessions are already 0.

-- Preview what will be deleted (optional):
-- select id, user_id, created_at from public.boards
-- where id not in (select board_id from public.sessions where board_id is not null);

delete from public.boards
where id not in (
  select board_id
  from public.sessions
  where board_id is not null
);

-- Verify
select
  (select count(*) from public.sessions) as sessions_left,
  (select count(*) from public.session_participants) as participants_left,
  (select count(*) from public.boards) as boards_left;
