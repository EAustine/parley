-- IP rate limiting for the token endpoint.
--
-- §8 leans on this: "Guessing a code is 8×10^14 attempts; rate limiting closes
-- the rest." That makes it a security control rather than a courtesy, and a
-- counter held in a module-level Map does not survive serverless. Each cold
-- instance would start from zero, so the real limit would be 10 per minute
-- *per instance* — a number nobody chose and nobody can see.
--
-- Postgres already has the properties needed: shared across instances, atomic
-- under concurrency, durable. The cost is one round trip on the join path,
-- which is well inside §10's budget.
--
-- No new dependency. A Redis would be the conventional answer and would need
-- asking for.

create table rate_limits (
  key           text primary key,
  window_start  timestamptz not null default now(),
  count         int not null default 0
);

-- Old windows are dead weight; this makes them cheap to sweep.
create index rate_limits_window_idx on rate_limits(window_start);

alter table rate_limits enable row level security;
-- No policies, deliberately. Nothing reaches this table except the function
-- below, which is security definer. `anon` and `authenticated` cannot read
-- their own limits, let alone anyone else's.

/**
 * Counts one request against a key and says whether it is allowed.
 *
 * A fixed window, not a sliding one. A sliding window is more accurate at the
 * boundary and needs per-request timestamps; for "stop someone enumerating
 * codes" the fixed window is the right trade and its worst case — 2× the limit
 * across a window boundary — is not a meaningful weakening of 8×10^14.
 *
 * The whole read-modify-write is one statement, so two simultaneous requests
 * cannot both read the same count and both write count+1. Doing this as a
 * select followed by an update is the classic way to build a limiter that does
 * not limit.
 */
create or replace function public.consume_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
begin
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
  returning r.count into v_count;

  return v_count <= p_limit;
end;
$$;

-- Server-side only. The route handler calls this with the service role; a
-- client able to call it could burn through its own allowance on purpose, or
-- someone else's by guessing their key.
revoke all on function public.consume_rate_limit(text, int, int) from public;
revoke all on function public.consume_rate_limit(text, int, int) from anon, authenticated;
