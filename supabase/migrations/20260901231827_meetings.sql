-- Parley — meetings and participants.
-- Schema is PRD.md §6. RLS is the point of this file: hosts reach only their
-- own rows, and the single anonymous read path is a security definer function
-- that returns six columns and nothing else.

create type meeting_status as enum ('scheduled', 'live', 'ended');

create table meetings (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  title             text not null default 'Meeting',
  description       text,
  host_id           uuid not null references auth.users(id) on delete cascade,
  status            meeting_status not null default 'scheduled',
  scheduled_start   timestamptz,          -- null = instant meeting
  scheduled_end     timestamptz,
  timezone          text not null default 'UTC',   -- IANA, creator's zone
  sequence          int not null default 0,        -- for .ics updates
  settings          jsonb not null default
                      '{"guests_allowed":true,"mute_on_entry":false}'::jsonb,
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  ended_at          timestamptz
);

create index meetings_host_idx on meetings(host_id, scheduled_start desc);
create index meetings_code_idx on meetings(code);

create table meeting_participants (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references meetings(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,  -- null = guest
  display_name  text not null,
  identity      text not null,        -- LiveKit identity string
  role          text not null default 'participant',  -- 'host' | 'participant'
  joined_at     timestamptz not null default now(),
  left_at       timestamptz
);

create index mp_meeting_idx on meeting_participants(meeting_id, joined_at);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Enabled with no permissive policy for `anon` on either table: the join flow
-- reads through get_meeting_by_code() below, never through the table.
--
-- auth.uid() is wrapped in a scalar subquery throughout. Called bare it is
-- re-evaluated per row; as `(select auth.uid())` the planner hoists it to an
-- InitPlan and evaluates it once, which is the difference between an index
-- scan and a sequential one on a large table.
-- ---------------------------------------------------------------------------

alter table meetings enable row level security;
alter table meeting_participants enable row level security;

create policy "Hosts read their own meetings"
  on meetings for select
  to authenticated
  using (host_id = (select auth.uid()));

create policy "Hosts create meetings they own"
  on meetings for insert
  to authenticated
  with check (host_id = (select auth.uid()));

-- `using` picks the rows that may be updated; `with check` stops an update
-- from reassigning host_id and handing the row to someone else.
create policy "Hosts update their own meetings"
  on meetings for update
  to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

create policy "Hosts delete their own meetings"
  on meetings for delete
  to authenticated
  using (host_id = (select auth.uid()));

-- Participants are written server-side during token minting, which uses the
-- service role and bypasses RLS. The only client-side need is the host reading
-- the panel, so read is the only policy here.
create policy "Hosts read participants of their own meetings"
  on meeting_participants for select
  to authenticated
  using (
    exists (
      select 1
      from meetings m
      where m.id = meeting_participants.meeting_id
        and m.host_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- The one anonymous read path
--
-- A guest opening /j/[code] needs the meeting title and whether guests are
-- allowed. Opening the table to `anon` would expose host_id, settings, and
-- every other meeting's row. This returns six columns for one code and nothing
-- else: no host identity, no participant list, no settings beyond the one flag
-- the join page needs.
--
-- security definer runs with the owner's rights, so it must not inherit a
-- caller-controlled search_path — pinned below. EXECUTE is revoked from PUBLIC
-- first, because Postgres grants it by default and a bare `grant` would leave
-- that default in place.
-- ---------------------------------------------------------------------------

create or replace function public.get_meeting_by_code(p_code text)
returns table (
  code text,
  title text,
  status meeting_status,
  scheduled_start timestamptz,
  timezone text,
  guests_allowed boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select m.code, m.title, m.status, m.scheduled_start, m.timezone,
         coalesce((m.settings->>'guests_allowed')::boolean, true)
  from meetings m
  where m.code = p_code
    and m.status <> 'ended'
$$;

revoke all on function public.get_meeting_by_code(text) from public;
grant execute on function public.get_meeting_by_code(text) to anon, authenticated;
