# Build plan v1.5 — the waiting room, and who was in the room

The first pass that adds a feature rather than repairing one. It exists because of a specific finding: the meeting link is the entire credential, and until now nothing stood between holding one and being in the room.

Read `CLAUDE.md` for rules and tokens, `PRD.md` for spec, `BUILD-PLAN-v1.4.md` for the previous pass, `BRAND.md` for identity.

**`design/02-room.html` does not cover any of Track A.** The waiting queue, the waiting screen and the attendance table are specified here in prose. Build from this, then update the design file to match — not the other way round.

## Prerequisites

**This plan assumes v1.4 has landed.** A1 is confirmed fixed. A2, B1 and B2 have not been confirmed, and one of them is load-bearing here:

- **v1.4 B1 — the participant row — is a hard prerequisite for A2.** The waiting queue is a section at the top of the People tab, above rows that currently blow their own height with a wrapped connection line and lose the name on hover. Adding a queue above that is building a second storey on the floor you are still repairing.
- v1.4 A2 (the bar's placement) and B2 (the mobile menu) are independent and can run either side.

If B1 has not landed, do it first.

---

## Track D first — the layer scale

Out of alphabetical order because everything in Track A depends on it.

### D1. There is no stacking scale, which is why reactions are behind the PiP

A reaction sent with more than two people in the room draws underneath the self-view. The one-line fix is a larger number on the reaction layer, and it would leave the cause untouched: **`CLAUDE.md` and `PRD.md` contain no z-index rule of any kind.** Every layer's order has been decided locally, by whoever wrote the component. C1's PiP arrived after the reaction layer existed and won by default.

That is not a bug that got fixed once. This pass alone adds three more layers to the same room — the waiting toast, the queue section, the reactions sheet from v1.4 — and each of them will be ordered by whoever writes it.

**A named scale in `CLAUDE.md`, and no bare numbers anywhere.** The room's order, ground upward:

| Layer | Holds |
|---|---|
| Base | Video tiles, the grid, the filmstrip |
| Self | The PiP |
| Ephemera | Reactions |
| Chrome | Control bar, panel |
| Menus | Overflow, leave, participant `⋮` |
| Dialogs | Confirm, settings, connection failure overlay |
| Notices | Toasts, including the waiting notice |

Reactions above the PiP because a reaction hidden behind your own face is the reported bug. Reactions **below** chrome because a reaction occluding a control is worse than one occluding a face, and §3.6 already says they must not occlude a tile's name or mic indicator — this is the same rule, one layer up.

**`check:layers`**, in the shape of `check:scrim`: scan for numeric `z-index` and Tailwind `z-[…]` outside the scale, fail on any. The scale is worth nothing if the next component can still write `z-50`.

### D2. Reactions anchor to a tile that no longer exists

§3.6 says a reaction animates upward "from the sender's tile." C1 took your tile away and gave you a PiP, and nobody updated the sentence — the same shift that moved the layout table's rows and went unnoticed for the same reason.

Your own reaction anchors to the PiP. When you are alone you have a full tile and no PiP, so it anchors to the tile. Both cases must clear the control bar's band rather than passing behind it.

---

## Track A — the waiting room

**The rule, stated once:** with the waiting room on, nobody enters until a host is in the room, and after that every guest is admitted by the host individually. Signed-in participants pass straight through.

### A1. The door

A `waiting_room` boolean on the meeting, checked in the token endpoint. Not the client — the client is the thing being kept out.

**Nobody enters before a host is present, including the first arrival.** The alternative — an open door until the host lands — was considered and rejected. The link-holder who should not be there arrives *early*, which is the natural behaviour of anyone unsure of the time and exactly what happens with a link that has been circulating for days. A door that opens for early arrivals is open when the risk is highest and shuts once the host is there to see who is coming anyway. It also produces two people pasting the same link thirty seconds apart and getting different outcomes, with no way for either to tell why. And the case it protects is already the toggle: waiting room off *is* "let people in early."

**Host presence means joined, not sitting in pre-join.** A host choosing a camera has not arrived. The consequence is that a host who spends a minute in pre-join returns to a queue that formed while they were picking a mic, which is correct — the queue is the feature working.

**There is no co-host, so a host who never arrives means a meeting nobody enters.** That is a real regression against today, where people could at least gather, and it is accepted rather than overlooked. It is mitigated by copy, not by mechanism: after a period of waiting with no host present, the waiting screen must say so rather than spinning indefinitely. Nobody should be left to guess whether the product is broken.

**Defaults.** On for scheduled meetings, off for instant. The risk is a function of how long a link has been in the world: a scheduled link went out days ago to a list nobody re-reads, an instant link was pasted seconds ago to someone already waiting. Reversible in both directions and worth revisiting once there is any usage to look at.

**The queue lives in Supabase, not in LiveKit.** A waiting person is not in the room at all — no token, nothing minted. The tempting alternative is to admit them with subscribe and publish disabled and let the room be the queue, which is elegant and whose failure mode is *the person you did not admit heard the meeting*. A correctness property this size does not rest on getting a third party's permission flags exactly right, which is rule 8's argument about third-party resets in a more expensive setting.

So: the waiting client polls a lightweight route until it is admitted, denied, or the host ends the meeting. Boring, and its worst case is waiting a few seconds longer.

**The new routes need §7's two-tier limits.** A join request that reaches a lookup is a request that costs something, and the waiting endpoint is a lookup on every poll.

### A2. The host's view

**A section at the top of the People tab.** Not a third tab — C3 merged two panels into one surface with two tabs and a third would undo it. Each waiting request shows the name the person typed, with **Allow** and **Deny**.

**Two adjacent controls, one of them a refusal, and v1.4's B1 refused exactly that construction.** The distinction is real and worth writing so this does not read as an inconsistency: a roster row is passive, it exists to be read, and a stray tap on hover-revealed actions acted on someone you were only looking at. A waiting request is a pending decision — the row exists *solely* to be answered, both answers are expected, and Deny is reversible under B2. Putting one of two expected answers behind a menu costs the common flow and buys no safety. Allow is primary, Deny is secondary and visually distinct, both on the 44px floor, and neither is hover-revealed.

**The badge carries the waiting count while a queue exists.** The People badge shows the roster count today. A waiting count is a different kind of fact and must not be added to it — three people present and two waiting is not five. The waiting count takes the badge with a distinct treatment while the queue is non-empty and hands it back when it clears.

**The toast is a hint; the panel is the truth.** A toast auto-dismisses, so a request arriving while the host is talking is a request the host never sees if the toast is the only notice. The badge persists until the queue empties. Ten people waiting produces **one** toast saying how many, never ten toasts.

### A3. The waiting person's screen

Pre-join, then held: "Waiting for the host to let you in."

**Waiting is not joining, and nothing publishes.** The camera and mic state chosen at pre-join is held and applied at the moment of admission. This is v1.4 A1's rule reaching one step further back — a person who is not in a meeting is not on camera in it.

Escapable throughout. Leave is live from the first second.

**Five terminal states that must not share a screen**, extending §3.11's rule from three:

| State | Says |
|---|---|
| Admitted | Enters the room |
| Denied | "The host didn't let you in." |
| Removed | "The host removed you from the meeting." |
| Host never arrived | Says so, after a wait, rather than spinning |
| Meeting ended while waiting | §3.4's ended state, with no Rejoin |

Denied and removed carry the same block and different copy. Being turned away and being ejected are different experiences and the product should not tell someone the wrong one happened to them.

---

## Track B — the block

Denied and removed people stay out for ten minutes. The hard part is not the ten minutes; it is identifying the same person when they have no account.

### B1. Where it lives, and what it can honestly do

**In the token endpoint, before minting.** That is the only place that can actually refuse. A `meeting_blocks` row: meeting, subject, subject type, reason, `expires_at`.

**Not IP.** §7 already worked this out for rate limiting — seventeen colleagues behind one NAT. Block by IP and removing one person can lock out their whole building, which is a far worse failure than the one being prevented.

| Subject | Mechanism | Holds against |
|---|---|---|
| Signed in | User id | Everything short of a second account |
| Guest | Signed `httpOnly` device token, issued at first contact, scoped to the meeting | Reloads, new tabs, a different browser profile |

**A private window defeats the guest block, and the documents must say so plainly** rather than implying a wall. It raises the cost of returning from nothing to knowing to open a private window, which stops the ordinary case and is worth having. Claiming more than that is the kind of thing §10 keeps getting wrong in the other direction — a mechanism described as stronger than it was measured to be.

**Ten minutes, with its reason written beside it**: long enough that a nuisance loses interest, short enough that a mistake costs one coffee. Written down or it gets relitigated in three passes' time.

### B2. The host can undo it

**"Let them back in" clears the row.** Removing the wrong person and being unable to fix it for ten minutes is a worse outcome than the one the block exists to prevent, and it is the more likely of the two.

A blocked person who tries to return surfaces to the host **once**, not once per attempt. A stream of notices for one person hammering reload is a denial of the host's attention.

---

## Track C — the record

### C1. Who was in the meeting

On the meeting detail page for an ended meeting: the participant list, with the name each person entered, who was removed, and who was denied entry.

Sources are mostly there. `participant_sessions` carries joins and leaves and now has its idempotency index. Two things it does not carry:

- **A removal is indistinguishable from leaving.** The removal route must write the reason.
- **A denied person never joined**, so no `participant_joined` ever fired. They need a row with no join, which means checking the partial unique index still behaves — it was built for a different shape and this is the first thing to test against it, not after.

**Verified and typed names must be visibly different, and this is the load-bearing part.** Signing in buys accountability, not authorisation — anyone can sign in with any Google account, so a signed-in person is identifiable rather than invited. That is still the right line for A1's guest-only door, and it means a guest can type your name and sit in the roster looking like you. A record that lists "Austine Eluro" without saying whether that was attested or typed implies an attestation the product cannot make. Show which is which, in the room's roster and in this record.

**A denied person's name is a string typed by someone who never got in.** Run it through the display-name sanitiser that already exists — length cap, email-shape rejection — before it is persisted, and render it as text. §3.2's rule stands: no route puts an email address in front of anyone.

Host only, enforced by RLS, like every other meeting row.

---

## Sequence

1. **D1** — the layer scale and `check:layers`. Everything below adds layers; building them first means ordering them twice.
2. **A1 with B1** — the door and the block are the same refusal at the same gate, and A2's Deny has nowhere to write until the block table exists.
3. **A3** — the waiting screen and its five states.
4. **A2** — the queue in People. **Needs v1.4 B1.**
5. **B2** — the undo, and the once-only notice.
6. **C1** — the record.
7. **D2** — the reaction anchor.

## Documents to update

Not optional, and not a cleanup pass afterwards. Four of the five decisions in this plan are new spec, and the last three passes have each found a defect that grew in a sentence nobody wrote.

- **§13 loses "waiting room / lobby"** from the out-of-scope list. It is the line that most needs deleting, because it is the one a future session would cite to argue this feature away.
- **§3.2** — the toggle, its defaults and its two homes.
- **§3.3** — pre-join gains a host variant and a waiting state, and A3's rule that waiting is not joining.
- **§3.6** — the reaction anchor, and the stacking rule.
- **§3.8** — the queue section, the badge's two meanings, verified versus typed.
- **§3.10** — the attendance record on the detail page.
- **§7** — the block check before minting, the waiting endpoints, and their rate-limit tier.
- **§8** — the block's honest limit, stated as a limit.
- **`CLAUDE.md`** — the layer scale.

## Guardrails

Unchanged, plus three this pass introduces.

No new colours. Nothing on a scrim uses `--foreground`. Every new control keeps its name, its role and its target size, measured rather than declared — Allow, Deny, "Let them back in" and the waiting screen's Leave are all room-surface controls on the 44px floor.

**No bare z-index.** The scale or nothing, enforced by `check:layers`.

**Nothing publishes before admission.** The v1.4 A1 rule extends to the waiting state without exception. A waiting person is not in a meeting.

**Do not overstate the block.** It is a cost, not a wall, and the moment the documents describe it as a wall someone will build on the claim.

Re-run the Phase 9 state list at the end, states not routes, in both themes — it is now five states longer than the last time it ran.
