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

-- Session visibility: participants or facilitators can read session.
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
for select
using (
  exists (
    select 1 from public.session_participants sp
    where sp.session_id = sessions.id and sp.user_id = auth.uid()
  )
  or created_by = auth.uid()
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
  exists (
    select 1 from public.session_participants self
    where self.session_id = session_participants.session_id
      and self.user_id = auth.uid()
  )
  or exists (
    select 1 from public.sessions s
    where s.id = session_participants.session_id
      and (s.created_by = auth.uid() or auth.uid() = any(s.facilitator_ids))
  )
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
  check (role in ('facilitator', 'co_facilitator', 'participant', 'observer'));

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
