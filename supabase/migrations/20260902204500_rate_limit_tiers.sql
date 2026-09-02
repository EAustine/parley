-- Two-tier rate limiting, and a Retry-After the client can act on.
--
-- §7 replaced the flat 10/min/IP, and the reasoning is worth keeping next to
-- the code: seventeen colleagues joining one meeting share one office IP, and
-- carrier-grade NAT puts thousands of mobile subscribers behind a handful of
-- addresses. A limit low enough to stop enumeration was low enough to stop a
-- full room, and to stop strangers who happened to share a carrier.
--
-- The number was also guarding the wrong thing. At 8×10^14 codes, brute force
-- takes geological time whatever the limit is. What separates an office from an
-- enumerator is not how many requests they make but how many *resolve*:
-- seventeen colleagues produce seventeen hits, an enumerator produces a stream
-- of misses. So the tight limit moved onto misses, counted after lookup, and
-- the overall limit rose to something a real room can live inside.
--
-- This function gains a second return value. `Retry-After` is what lets §7's
-- "a 429 on join is not a dead end" actually work — without it the client can
-- only guess when to try again, and a guess is how you get either a stampede or
-- a screen that sits there longer than it needs to.

-- The return type changes, which `create or replace` cannot do.
drop function if exists public.consume_rate_limit(text, int, int);

create function public.consume_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns table (allowed boolean, retry_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
  v_start timestamptz;
begin
  -- A fixed window, not a sliding one. A sliding window is more accurate at the
  -- boundary and needs per-request timestamps; for this the fixed window is the
  -- right trade, and its worst case — 2× the limit across a boundary — is not a
  -- meaningful weakening of 8×10^14.
  --
  -- The whole read-modify-write is one statement, so two simultaneous requests
  -- cannot both read the same count and both write count+1. A select followed
  -- by an update is the classic way to build a limiter that does not limit.
  insert into rate_limits as r (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case
          when r.window_start < v_now - make_interval(secs => p_window_seconds)
          then 1
          else r.count + 1
        end,
        window_start = case
          when r.window_start < v_now - make_interval(secs => p_window_seconds)
          then v_now
          else r.window_start
        end
  returning r.count, r.window_start into v_count, v_start;

  allowed := v_count <= p_limit;
  -- Seconds until this window ends. At least 1: a Retry-After of 0 invites an
  -- immediate retry, which is the stampede this is meant to spread out.
  retry_after := greatest(
    1,
    ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - v_now)))::int
  );
  return next;
end;
$$;

revoke all on function public.consume_rate_limit(text, int, int) from public;
revoke all on function public.consume_rate_limit(text, int, int) from anon, authenticated;
