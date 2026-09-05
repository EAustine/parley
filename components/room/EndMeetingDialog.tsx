"use client";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

/**
 * v1.3 B1's commitment step, in the room.
 *
 * Ending disconnects everyone and stops the link working, and there is no undo
 * — §3.2 keeps `ended` distinct from `cancelled` precisely because they are
 * different endings, and neither is reversible. So the destructive item does
 * not act; it asks.
 *
 * The dialog mechanics moved to `components/shared/ConfirmDialog` when v1.3 D4
 * gave "Cancel meeting" the same treatment. What is left here is what was ever
 * specific to the room: the words.
 */
export function EndMeetingDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      id="end-meeting"
      title="End this meeting for everyone?"
      body="Everyone is disconnected straight away and the link stops working. This can’t be undone."
      confirmLabel="End meeting"
      pending={pending}
      onConfirm={onConfirm}
      onDismiss={onCancel}
    />
  );
}
