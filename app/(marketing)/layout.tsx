import { SiteShell } from "@/components/shared/SiteShell";
import { Toaster } from "@/components/ui/sonner";

/**
 * The Toaster is here because `/` now has a control that can fail — v1.3 E3.
 *
 * `StartMeetingButton` reports a failed creation with `toast.error`, and the
 * marketing route rendered no `<Toaster />` at all: the meeting silently did
 * not get made, the button returned to its idle label, and nothing on screen
 * said why. `CLAUDE.md`'s never-do list is explicit — "ship a state with no
 * design; silent failure is the worst outcome in this product."
 *
 * The `(app)` layout mounts its own for the measured reason it records: in the
 * root layout every route pays for sonner, including the two that never toast.
 * That reasoning is unchanged — this route now *does* toast, so it pays.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell>
      {children}
      <Toaster />
    </SiteShell>
  );
}
