"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * One device chooser, shared by pre-join and the room — v1.3 B2.
 *
 * "§3.3 specified device selectors in pre-join and nothing after. **Build once,
 * for all three**." This was pre-join's private component; the mid-call
 * settings dialog needs the same control, and a second copy is how the two
 * would drift — the empty-state copy below is the sort of thing that gets fixed
 * in one place and not the other.
 *
 * Native `<select>`, per v1.2: Radix's failed axe twice and the open listbox
 * could not enter the scan at all.
 */
export function DeviceSelect({
  id,
  label,
  options,
  value,
  onChange,
  ready,
}: {
  id: string;
  label: string;
  options: { deviceId: string; label: string }[];
  value: string | null;
  onChange: (deviceId: string) => void;
  ready: boolean;
}) {
  // §3.3: labels are empty until permission is granted, so an empty dropdown
  // would be a control that looks broken. Say why it is empty instead.
  if (!ready || options.length === 0) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id} className="type-small">
          {label}
        </Label>
        <p id={id} className="type-small text-muted-foreground">
          {ready ? `No ${label.toLowerCase()} found.` : "Allow access to choose a device."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="type-small">
        {label}
      </Label>
      {/* 44px: the device selectors are targets on a pre-join surface. */}
      <Select
        id={id}
        size="touch"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {/* The placeholder is an option rather than a separate slot, and it
            disappears once a device is chosen — a native select always has a
            value, so there is nothing for an empty state to mean afterwards. */}
        {value == null && (
          <option value="" disabled>
            {`Choose a ${label.toLowerCase()}`}
          </option>
        )}
        {options.map((option) => (
          <option key={option.deviceId} value={option.deviceId}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
