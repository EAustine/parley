-- Clear the email addresses that got stored as display names.
--
-- Until `lib/auth/display-name.ts`, the token route derived a name as
-- `requested ?? full_name ?? user.email ?? "Host"`. Only Google sign-in leaves
-- a `full_name`, so for every magic-link host the email address was the answer
-- — and the webhook writer copied it out of the token metadata into this
-- column on every join.
--
-- Nothing renders `display_name`; the people panel reads live LiveKit state.
-- So this is not a live disclosure, and it is still stored personal data that
-- was never meant to be here, held against rows that outlive the meeting.
--
-- ## The predicate is exact, not a shape match
--
-- `display_name like '%@%'` would have been the obvious filter and would be
-- wrong in both directions. `sanitiseDisplayName` permits `@` — someone typing
-- "ama@work" as the name they want on their tile passes it — so a shape match
-- destroys legitimate names people chose. Joining to `auth.users` and requiring
-- the stored name to equal that account's actual address touches exactly the
-- rows the defect wrote, and nothing else.
--
-- Guests are untouched by construction: they always supplied a name, and their
-- rows carry `user_id is null`, so the join excludes them.
--
-- **What this does not reach:** an account that has changed its email address
-- since the row was written. `auth.users.email` holds the current one, so an
-- old address stored under a changed account will not match. There is no such
-- account today, and widening the predicate to catch a hypothetical one would
-- mean going back to the shape match this deliberately avoids.

-- The column was `not null`, so clearing requires allowing null.
--
-- This is a real weakening of the schema for a historical cleanup, and it is
-- worth naming rather than slipping past. Going forward the column is never
-- null: the token endpoint now refuses to mint without a name, so no join can
-- produce a nameless row. The constraint that used to enforce that at the table
-- is enforced one layer up instead — and `Insert` in `lib/supabase/types.ts`
-- keeps `display_name` required, so the client contract stays stricter than the
-- table. Null here means "a name that should never have been recorded", which
-- is exactly what the historical rows are.
alter table meeting_participants
  alter column display_name drop not null;

update meeting_participants p
set display_name = null
from auth.users u
where p.user_id = u.id
  and p.display_name = u.email;
