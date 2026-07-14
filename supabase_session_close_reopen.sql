-- Session close / reopen: only active sessions are editable.
-- Apply in Supabase SQL Editor after phase0 sessions are in place.

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
        -- Personal boards still owned by user remain editable when not session-locked.
        (
          b.user_id = p_user_id
          and not exists (
            select 1
            from public.sessions s
            where s.board_id = b.id
              and lower(coalesce(s.status, 'active')) in ('closed', 'ended', 'archived')
          )
        )
        or exists (
          select 1
          from public.sessions s
          join public.session_participants sp
            on sp.session_id = s.id
           and sp.user_id = p_user_id
          where s.board_id = b.id
            and lower(coalesce(s.status, 'active')) = 'active'
            and sp.role in ('facilitator', 'participant')
        )
      )
  );
$$;

grant execute on function public.user_can_edit_board(bigint, uuid) to authenticated;

-- Optional status check constraint (allows active + closed + ended + archived).
do $$
begin
  alter table public.sessions drop constraint if exists sessions_status_check;
  alter table public.sessions
    add constraint sessions_status_check
    check (lower(status) in ('active', 'closed', 'ended', 'archived', 'draft'));
exception
  when others then
    raise notice 'sessions_status_check skipped: %', sqlerrm;
end $$;
