-- The host can undo a block, and hears about a return once — v1.5 B2.
--
-- B2: "'Let them back in' clears the row. Removing the wrong person and being
-- unable to fix it for ten minutes is a worse outcome than the one the block
-- exists to prevent, and it is the more likely of the two."
--
-- Three columns, each for a sentence in that item.

-- **Who it is.** `meeting_blocks` carried a subject and no name, which is
-- enough to refuse somebody at the door and not enough to offer the host a
-- decision about them: "let them back in" needs a them. Written from the row
-- the block came from — the queue entry that was denied, or the session that
-- was removed — so it is the same name that person was known by, already
-- sanitised.
alter table meeting_blocks
  add column if not exists display_name text;

-- **That they came back.** Bumped by the token endpoint each time a blocked
-- person is refused, which is the only place that knows.
alter table meeting_blocks
  add column if not exists attempted_at timestamptz;

-- **That the host has been told.** B2: "a blocked person who tries to return
-- surfaces to the host **once**, not once per attempt. A stream of notices for
-- one person hammering reload is a denial of the host's attention."
--
-- Server-side rather than remembered by the client, and the difference matters:
-- a client-side memory re-announces on every reload, so somebody reloading in
-- one tab while the host reloads in another still produces a stream. The pair
-- `attempted_at > notified_at` is the whole rule, and it survives both.
alter table meeting_blocks
  add column if not exists notified_at timestamptz;

-- The panel lists blocks by recency of attempt, so the ordering is worth an
-- index once a meeting has more than a handful.
create index if not exists mb_attempt_idx
  on meeting_blocks (meeting_id, attempted_at desc);

-- ---------------------------------------------------------------------------
-- Hosts already read and delete their own meeting's blocks
-- (`20260906140000_waiting_room.sql`). Clearing one is a delete, which that
-- policy covers, so B2's undo needs no new policy — the route uses the host's
-- own client and RLS is the authorisation, the same as every other host action.
