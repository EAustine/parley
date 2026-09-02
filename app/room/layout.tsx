/**
 * The room is dark regardless of the viewer's theme — rule 8b, the same
 * boundary `/j/` sets. No site header: this is the call, not a document.
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
