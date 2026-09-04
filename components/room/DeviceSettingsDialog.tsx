"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeviceSelect } from "@/components/shared/DeviceSelect";
import type { useDevices } from "@/lib/hooks/useDevices";

/**
 * Audio and video settings, during a meeting — v1.3 B2.
 *
 * §3.3 gave pre-join three selectors and gave the room none, so the only moment
 * a device could be changed was before you were in a position to discover it
 * was the wrong one. Field issues 2 and 5 are the same feature missing twice.
 *
 * The same `DeviceSelect` pre-join renders, which is what "build once, for all
 * three" means in practice: one empty state, one placeholder rule, one set of
 * touch targets.
 *
 * **Modal, deliberately.** The floor traps modal surfaces and leaves non-modal
 * panels reachable, and the distinction is whether the meeting continues behind
 * it. Chat and participants do; changing which microphone you are publishing is
 * a task you finish. It is also the shape of every other dialog in the room.
 */
export function DeviceSettingsDialog({
  devices,
  onClose,
}: {
  devices: ReturnType<typeof useDevices>;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="dark max-w-sm">
        <DialogTitle className="type-h2">Audio and video</DialogTitle>
        <DialogDescription className="type-small text-muted-foreground">
          Changes apply straight away, and are remembered for your next meeting.
        </DialogDescription>

        <div className="mt-2 space-y-4">
          <DeviceSelect
            id="room-camera"
            label="Camera"
            options={devices.cameras}
            value={devices.active.videoinput ?? null}
            onChange={(id) => void devices.switchTo("videoinput", id)}
            ready
          />
          <DeviceSelect
            id="room-microphone"
            label="Microphone"
            options={devices.microphones}
            value={devices.active.audioinput ?? null}
            onChange={(id) => void devices.switchTo("audioinput", id)}
            ready
          />
          {/*
            B2: "Speaker selection needs `HTMLMediaElement.setSinkId`,
            unsupported in Safari. Feature-detect and **hide** rather than
            showing a control that does nothing." Hidden rather than disabled,
            for the same reason §3.7 hides screen share where `getDisplayMedia`
            is absent: a disabled control invites someone to keep trying.
          */}
          {devices.speakerChoosable && (
            <DeviceSelect
              id="room-speaker"
              label="Speaker"
              options={devices.speakers}
              value={devices.active.audiooutput ?? null}
              onChange={(id) => void devices.switchTo("audiooutput", id)}
              ready
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
