-- Ended meetings resolve for 30 days.
--
-- The original function filtered `status <> 'ended'`, so an ended meeting and a
-- code that never existed were indistinguishable — both returned no rows. The
-- common case there is someone with a legitimate link arriving late, and
-- telling them the meeting doesn't exist is a lie.
--
-- After 30 days they fall through to not-found and stale links stop resolving.
--
-- This does confirm that a code was once real. With ~8×10^14 codes and a
-- rate-limited token endpoint, enumeration is not a practical attack, and the
-- cost of the alternative is a wrong answer to an honest question.
--
-- `coalesce(ended_at, created_at)` because a meeting can reach 'ended' without
-- `ended_at` being set — a webhook that never fired, a status changed by hand.
-- Falling back to `created_at` means the window closes on those rather than
-- leaving them resolvable forever.
--
-- Joinability is NOT decided here. This function is display data. An ended
-- meeting resolving does not mean its room can be entered; the token endpoint
-- is what refuses that.

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
    and (
      m.status <> 'ended'
      or coalesce(m.ended_at, m.created_at) > now() - interval '30 days'
    )
$$;

-- `create or replace` preserves existing privileges, so these are a restatement
-- rather than a change. Kept because the access list should be readable in the
-- migration that defines the function, not only in the one before it.
revoke all on function public.get_meeting_by_code(text) from public;
grant execute on function public.get_meeting_by_code(text) to anon, authenticated;
