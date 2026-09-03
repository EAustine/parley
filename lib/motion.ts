/**
 * Shared motion for pressable controls — v1.2 E2's "Control hover / press |
 * 120 / 80ms | cubic-bezier(0.2, 0, 0, 1)".
 *
 * One constant rather than three copies. Track B4 wrote this for the room's
 * control bar, `ReactionPicker` grew a near-identical copy of it, and the
 * pre-join device toggles had neither — so the same row of the same table was
 * implemented twice and missed once. E2 says "control", not "control bar", and
 * a mic toggle is the same control whichever screen it is on.
 *
 * The two durations differ on purpose: a press should land immediately and a
 * hover should ease in, and `active:duration` is what lets one element carry
 * both.
 *
 * `motion-reduce` drops the travel and keeps the colour change, which is
 * CLAUDE.md's rule — "removes travel, keeps opacity". A control that gives no
 * feedback at all on press is worse for everyone, and a fill is not travel.
 *
 * **`scale` and `translate`, not `transform`.** Tailwind v4 compiles
 * `hover:scale-[1.04]` to the individual `scale` property and leaves
 * `transform: none`, so a transition list naming `transform` covers a property
 * that never changes: the fill eased over 120ms while the scale snapped in 0ms.
 * Declared correctly and doing nothing, which is why the durations were right
 * and the motion was still wrong.
 *
 * `translate` is here for the Leave button. `components/ui/button.tsx` carries
 * `transition-all` and `active:…translate-y-px`, and `cn()` is twMerge — so
 * applying this constant *strips* `transition-all` (same `transition` group)
 * and the press nudge stopped being eased the moment B4 added the class.
 * Naming `translate` puts it back.
 *
 * `motion-reduce:transform-none` used to be here and was inert for the same
 * reason: it set `transform` while the travel lives on `scale`. Reduced motion
 * works, but through `motion-reduce:hover:scale-100` and its `active` twin —
 * so the dead class is gone rather than kept as decoration.
 *
 * The same individual-property gap has now bitten four times in this repo: the
 * panel slide's `translate`, the pre-join mirror, this, and the Leave nudge.
 */
export const CONTROL_MOTION =
  "transition-[scale,translate,background-color,border-color,color] " +
  "duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] " +
  "hover:scale-[1.04] active:scale-[0.96] active:duration-[80ms] " +
  "motion-reduce:hover:scale-100 motion-reduce:active:scale-100";
