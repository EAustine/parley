-- A2: one open session per identity per meeting.
--
-- `meeting_participants` gains a writer in v1.3 A2 — the LiveKit webhook, on
-- `participant_joined` and `participant_left`. A row is a *session*: it opens
-- when somebody arrives and closes when they go.
--
-- LiveKit retries a webhook it does not get a 2xx for, so `participant_joined`
-- can arrive twice for one arrival. Without this index the second delivery
-- inserts a second open row, and the live count — which is `left_at is null` —
-- reads one person too many for the rest of the meeting.
--
-- **Partial, on `left_at is null`.** A full unique index would say "this person
-- may only ever join once", which is wrong: someone whose connection drops and
-- who comes back is a second session and should be counted as one. Only the
-- *open* rows have to be unique, and that is exactly what the live count reads.
--
-- The route guards against the duplicate as well, because this index cannot be
-- applied from CI — it needs the database password. The guard is correct on its
-- own for every case except two concurrent retries of the same delivery, and
-- this closes that.
create unique index if not exists mp_open_session_idx
  on meeting_participants (meeting_id, identity)
  where left_at is null;
