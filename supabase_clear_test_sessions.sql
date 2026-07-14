-- Clear ALL training sessions and their linked boards.
-- Run in Supabase SQL Editor (run the whole script at once).
-- WARNING: this permanently deletes session + board data.

do $$
declare
  board_ids bigint[];
begin
  select coalesce(array_agg(distinct board_id), '{}'::bigint[])
  into board_ids
  from public.sessions
  where board_id is not null;

  delete from public.session_participants;
  delete from public.sessions;

  if array_length(board_ids, 1) is not null then
    delete from public.boards
    where id = any(board_ids);
  end if;
end $$;

-- Verify cleanup
select
  (select count(*) from public.sessions) as sessions_left,
  (select count(*) from public.session_participants) as participants_left,
  (select count(*) from public.boards) as boards_left;
