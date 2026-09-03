/**
 * The room is dark regardless of the viewer's theme — rule 8b, the same
 * boundary `/j/` sets. No site header: this is the call, not a document.
 *
 * **The wrapper does not reach portalled content.** Radix renders tooltips,
 * dialogs, popovers and selects into `document.body`, which is outside this
 * div — so they resolved against the *light* palette while the room around
 * them was dark. It stayed hidden from Phase 3 until Phase 9 because it only
 * appears when the viewer's OS is in light mode: otherwise `next-themes` puts
 * `.dark` on `<html>` and the portal inherits it anyway. axe caught it as a
 * 2.79:1 tooltip.
 *
 * Each portalled surface in `components/room/` and `components/prejoin/`
 * therefore carries `className="dark"` of its own, and `check:a11y` fails if
 * one is added without it.
 */
export default function RoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark flex min-h-dvh flex-col bg-background text-foreground [color-scheme:dark]">
      <main className="flex-1">{children}</main>
    </div>
  );
}
