-- Removing a guest keeps them out — BUILD-PLAN v1.5 B1, completing it.
--
-- B1 says "denied and removed people stay out for ten minutes". The deny path
-- did it and the remove path could not, for a structural reason rather than an
-- oversight: removal blocks by LiveKit identity, because the host's request is
-- the only thing the route has and a host's browser holds no cookie belonging
-- to the person being removed.
--
-- A signed-in participant's identity is `user_<uuid>`, which is durable and
-- matches on their next attempt. A guest's is `guest_<nanoid>`, minted fresh
-- for **every connection** — so the block was written against a string that
-- would never be presented again, and a removed guest could rejoin
-- immediately. For the population B1 is most about, removal did nothing.
--
-- This is the missing link: the token endpoint knows both the identity it is
-- minting and the durable subject behind it, and is the only place that ever
-- does. It writes the pair here; removal reads it.

create table if not exists meeting_identities (
  meeting_id    uuid not null references meetings(id) on delete cascade,
  -- The LiveKit identity this token was minted for.
  identity      text not null,
  -- The durable subject: `user_<uuid>` for an account, the device cookie id
  -- for a guest. The same vocabulary `meeting_blocks` uses.
  subject       text not null,
  subject_type  text not null check (subject_type in ('user', 'device')),
  created_at    timestamptz not null default now(),
  primary key (meeting_id, identity)
);

-- ---------------------------------------------------------------------------
-- Row level security, with **no policy at all** — and that is the point.
--
-- This table links a guest's device id to the identity they appeared under in
-- a room. That is the one piece of data in the product that would let somebody
-- correlate a person across sessions, and nobody but the server has any
-- business reading it: not the host, who needs the *effect* of a block and
-- never its subject, and certainly not another participant.
--
-- RLS on with no policies denies everyone; the service role bypasses it, which
-- is exactly the reach required. The same shape as the note above
-- `meeting_participants`: "written server-side during token minting, which uses
-- the service role and bypasses RLS" — except that one needs a host read and
-- this one needs none.
--
-- It cascades with the meeting, so the mapping never outlives the room it was
-- for.
alter table meeting_identities enable row level security;

-- ---------------------------------------------------------------------------
-- Why not a column on `meeting_participants`
--
-- That row is created by the webhook on `participant_joined`, which knows the
-- identity and has never seen a cookie. Having the token endpoint pre-create it
-- would mean writing a session row before anybody joined — and `left_at` would
-- be null on it, which is exactly what the dashboard's live count reads. Every
-- meeting would report people who had merely asked for a token.
--
-- Why not token metadata
--
-- Metadata is broadcast to every participant in the room. Putting a device id
-- there would hand everybody a stable identifier for everybody else, which is a
-- far worse disclosure than the one the block exists to manage.
