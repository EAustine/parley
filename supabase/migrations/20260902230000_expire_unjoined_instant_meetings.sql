-- §3.2's 12h expiry for instant meetings that were never joined.
--
-- "Instant — `scheduled_start` is null, room opens immediately, expires 12h
-- after creation if never joined." Until now nothing implemented that: an
-- instant meeting created and abandoned stayed joinable forever, and its link
-- resolved as a live meeting indefinitely.
--
-- **Derived at read time, not swept by a job.** Supabase does not ship a
-- scheduler on every tier, and a cron that flips rows is a second source of
-- truth that can be late, be down, or run twice. The expiry is a pure function
-- of `created_at` and `started_at`, both already on the row, so computing it in
-- the resolver is exact at every read and cannot drift. The cost is that the
-- stored `status` and the returned `status` differ for this one case, which is
-- why it is spelled out here rather than left to be discovered.
--
-- `started_at` is what makes "never joined" answerable, and it is written by
-- the LiveKit webhook this phase adds. Before the webhook existed no meeting
-- was ever marked started, so this rule could not have been written correctly
-- either — the two arrived together for that reason.
--
-- Expired reads as `ended` rather than as a fourth status. Someone opening a
-- day-old instant link should be told the meeting is over, which is what the
-- ended page already says; a new enum value would need its own copy, its own
-- join-page branch and its own migration to say the same thing. Cancelled
-- stayed separate because cancelled and ended are *different events* a person
-- experiences differently — an expiry is simply an ending nobody attended.
--
-- The 30-day resolution window applies to it too, and that needs saying
-- because the obvious way to write this gets it wrong. Filtering on the stored
-- status leaves an expired meeting matching the "not ended" branch forever, so
-- its link would resolve for years while every genuinely ended meeting stopped
-- at thirty days. The predicate is computed once below and used by both the
-- projection and the filter, so the two cannot disagree.
--
-- Joinability is still enforced at the token endpoint, which already refuses a
-- meeting whose resolved status is `ended` and so inherits this rule unchanged.

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
set search_path = public
as $$
  with resolved as (
    select
      m.*,
      (
        m.status not in ('ended', 'cancelled')
        and m.scheduled_start is null      -- instant meetings only
        and m.started_at is null           -- never joined
        and m.created_at <= now() - interval '12 hours'
      ) as expired
    from meetings m
    where m.code = p_code
  )
  select
    r.code,
    r.title,
    case when r.expired then 'ended'::meeting_status else r.status end,
    r.scheduled_start,
    r.timezone,
    coalesce((r.settings->>'guests_allowed')::boolean, true)
  from resolved r
  where
    (r.status not in ('ended', 'cancelled') and not r.expired)
    or coalesce(r.ended_at, r.created_at) > now() - interval '30 days'
$$;

grant execute on function public.get_meeting_by_code(text) to anon, authenticated;
