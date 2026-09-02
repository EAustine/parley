/**
 * Is the person typing?
 *
 * §9 requires every shortcut to be "suppressed while focus is in a text
 * input", and §3.4 repeats it for the mic and camera keys. That matters more
 * than it sounds: both shortcuts take over a browser shortcut (`Cmd+D` is
 * bookmark), so they call `preventDefault`. Getting this wrong does not merely
 * fire a toggle at the wrong moment — it swallows a keystroke someone was
 * typing into a field.
 *
 * Pure, and separate from the hook, so the list can be asserted. The cases
 * that matter are the ones that are not `<input type="text">`: a rich-text
 * composer is a `contenteditable` div, and the chat box arriving in Phase 5 is
 * exactly that kind of surface.
 */

/** `<input>` types nobody types into — a shortcut here is politeness misfiring. */
const NON_TEXT_INPUTS = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "file",
  "color",
  "image",
]);

/**
 * The parts of an element this needs. Structural rather than `HTMLElement` so
 * the rule can be exercised in Node by `npm run check:room` — a DOM-dependent
 * signature would make the one piece worth asserting the one piece that cannot
 * be.
 */
export type FocusTarget = {
  tagName?: string | null;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
} | null;

export function isTyping(target: FocusTarget): boolean {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable) return true;
  if (target.getAttribute?.("role") === "textbox") return true;

  const tag = target.tagName?.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;

  // A missing type attribute is a text field — that is the HTML default.
  const type = (target.getAttribute?.("type") ?? "text").toLowerCase();
  return !NON_TEXT_INPUTS.has(type);
}
