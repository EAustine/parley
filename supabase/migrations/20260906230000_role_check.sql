-- `role` is the presence check's only input, and nothing constrains it —
-- BUILD-PLAN v1.5 A1, step 2.
--
-- The column is `text not null default 'participant'` with the permitted values
-- written in a trailing comment, which is documentation rather than a rule. A1
-- puts it plainly: "the column is unconstrained text today, so the first typo
-- would write a role nothing matches and no error would say so."
--
-- That failure is silent in the worst possible direction. `hostIsPresent` reads
-- `role = 'host'`; a row written as 'Host', 'host ' or 'hosr' matches nothing,
-- the database answers "no host present", and the door stays shut on a meeting
-- whose host is sitting in it. The plan's own table calls that the *restrictive*
-- error and forgives it at seconds' cost — but a permanent one is a meeting
-- nobody can enter, and there would be no error anywhere to explain it.
--
-- Normalise before constraining. A `check` added over data that violates it
-- fails the migration, and the earlier rows here were written before the
-- webhook set `role` at all.
update meeting_participants
   set role = 'participant'
 where role is null or role not in ('host', 'participant');

alter table meeting_participants
  drop constraint if exists meeting_participants_role_check;

alter table meeting_participants
  add constraint meeting_participants_role_check
  check (role in ('host', 'participant'));
