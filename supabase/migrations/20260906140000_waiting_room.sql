-- The waiting room and the block — BUILD-PLAN v1.5 A1 and B1.
--
-- The finding this exists for: the meeting link is the entire credential, and
-- until now nothing stood between holding one and being in the room.

-- ---------------------------------------------------------------------------
-- A1: the door
--
-- Defaults false at the column, and the *create* route decides per meeting —
-- on for scheduled, off for instant. A1's reasoning is that risk tracks how
-- long a link has been in the world: a scheduled link went out days ago to a
-- list nobody re-reads, an instant link was pasted seconds ago to someone
-- already waiting. A column default cannot express that, because it cannot see
-- `scheduled_start`.
alter table meetings
  add column if not exists waiting_room boolean not null default false;

-- ---------------------------------------------------------------------------
-- The queue.
--
-- **In Supabase, not in LiveKit**, which A1 argues at length and is worth
-- keeping next to the table: the tempting alternative is to admit a waiting
-- person with subscribe and publish disabled and let the room be the queue,
-- and its failure mode is *the person you did not admit heard the meeting*. A
-- correctness property that size does not rest on getting a third party's
-- permission flags exactly right.
--
-- A waiting person therefore holds no token and is not in the room at all.
create table if not exists meeting_waiting (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references meetings(id) on delete cascade,
  -- Who is asking, in the same vocabulary the block uses: a `user_<uuid>` for
  -- somebody signed in, or the opaque device id for a guest.
  subject       text not null,
  subject_type  text not null check (subject_type in ('user', 'device')),
  user_id       uuid references auth.users(id) on delete set null,
  -- The name they typed. Sanitised before it lands here — C1 is explicit that
  -- a denied person's name is "a string typed by someone who never got in".
  display_name  text not null,
  status        text not null default 'waiting'
                  check (status in ('waiting', 'admitted', 'denied')),
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz
);

-- One open request per person per meeting.
--
-- Partial, on the open rows only, exactly like `mp_open_session_idx`: a person
-- denied at 10:00 and admitted at 10:05 has two rows and that is the record C1
-- wants, so the constraint has to be about what is *pending* rather than about
-- what ever happened.
create unique index if not exists mw_open_request_idx
  on meeting_waiting (meeting_id, subject)
  where status = 'waiting';

create index if not exists mw_meeting_idx
  on meeting_waiting (meeting_id, requested_at);

-- ---------------------------------------------------------------------------
-- B1: the block
--
-- Ten minutes, and the reason is written here so it is not relitigated in three
-- passes' time: long enough that a nuisance loses interest, short enough that a
-- mistake costs one coffee. B2 lets the host clear it early, because removing
-- the wrong person and being unable to fix it is the likelier of the two
-- failures.
--
-- **Never by IP.** §7 already worked this out for rate limiting — seventeen
-- colleagues behind one NAT — and blocking by IP means removing one person can
-- lock out their whole building.
create table if not exists meeting_blocks (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references meetings(id) on delete cascade,
  subject       text not null,
  subject_type  text not null check (subject_type in ('user', 'device')),
  reason        text not null check (reason in ('denied', 'removed')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create unique index if not exists mb_subject_idx
  on meeting_blocks (meeting_id, subject_type, subject);

create index if not exists mb_expiry_idx
  on meeting_blocks (expires_at);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Same shape as `meetings`: a host reaches their own meeting's rows and nobody
-- reaches anyone else's. The waiting person never selects from these tables at
-- all — they poll a `security definer` function that returns one row, their
-- own, which is why there is no read policy for them here.
alter table meeting_waiting enable row level security;
alter table meeting_blocks  enable row level security;

drop policy if exists "hosts read their meeting's queue" on meeting_waiting;
create policy "hosts read their meeting's queue"
  on meeting_waiting for select
  using (
    exists (
      select 1 from meetings m
      where m.id = meeting_waiting.meeting_id
        and m.host_id = (select auth.uid())
    )
  );

drop policy if exists "hosts decide their meeting's queue" on meeting_waiting;
create policy "hosts decide their meeting's queue"
  on meeting_waiting for update
  using (
    exists (
      select 1 from meetings m
      where m.id = meeting_waiting.meeting_id
        and m.host_id = (select auth.uid())
    )
  );

drop policy if exists "hosts read their meeting's blocks" on meeting_blocks;
create policy "hosts read their meeting's blocks"
  on meeting_blocks for select
  using (
    exists (
      select 1 from meetings m
      where m.id = meeting_blocks.meeting_id
        and m.host_id = (select auth.uid())
    )
  );

drop policy if exists "hosts clear their meeting's blocks" on meeting_blocks;
create policy "hosts clear their meeting's blocks"
  on meeting_blocks for delete
  using (
    exists (
      select 1 from meetings m
      where m.id = meeting_blocks.meeting_id
        and m.host_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- What a waiting person is allowed to know about themselves.
--
-- One row, theirs, by the id they were given when they joined the queue. No
-- listing, no count, no other person's name — the same reasoning as
-- `get_meeting_by_code`, which returns six columns and no host identity.
--
-- `security definer` because the caller is `anon` and the table has no read
-- policy for them, deliberately: a guest holding a link should not be able to
-- enumerate who else is waiting.
create or replace function public.get_waiting_status(p_id uuid, p_subject text)
returns table (status text, decided_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select w.status, w.decided_at
  from meeting_waiting w
  where w.id = p_id
    and w.subject = p_subject
$$;

grant execute on function public.get_waiting_status(uuid, text) to anon, authenticated;
