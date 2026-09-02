/**
 * The pre-join boundary. Everything from here into the room is dark,
 * regardless of the viewer's theme — rule 8b.
 *
 * The flip is what signals that you have left the document-like surfaces and
 * entered the call, and it means a camera preview is never shown on a light
 * ground. `.dark` on the wrapper is enough: the tokens are defined on the
 * class, so everything inside inherits them, and `color-scheme` keeps the
 * browser's own form controls and scrollbars in step.
 *
 * No site header here. One rendered above this from the root layout would stay
 * on the viewer's theme and leave a light bar sitting on a dark screen.
 */
export default function JoinLayout({
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
