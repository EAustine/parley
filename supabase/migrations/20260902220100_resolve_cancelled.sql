-- `get_meeting_by_code`, taught about cancellation.
--
-- Two changes, both from §3.2 and §6:
--
--   The 30-day resolution window now covers cancelled as well as ended. A
--   cancelled meeting's link must keep resolving to a designed state — the
--   whole point of the new status is that arriving late on a cancelled meeting
--   should say so, and falling through to the unknown-code page would tell
--   someone holding a real invite that it was never real.
--
--   `status` was already returned, which is what lets the client tell the
--   states apart. It now carries a third answer, and the client must branch on
--   all of them rather than treating any successful result as joinable.
--
-- Joinability is still enforced at the token endpoint. This function is display
-- data only.
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
  select m.code, m.title, m.status, m.scheduled_start, m.timezone,
         coalesce((m.settings->>'guests_allowed')::boolean, true)
  from meetings m
  where m.code = p_code
    and (
      m.status not in ('ended', 'cancelled')
      or coalesce(m.ended_at, m.created_at) > now() - interval '30 days'
    )
$$;

grant execute on function public.get_meeting_by_code(text) to anon, authenticated;
