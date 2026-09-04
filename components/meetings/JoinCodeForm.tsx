"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { CODE_LENGTH, normaliseMeetingCode } from "@/lib/meetings/code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "Try another code" — the field that turns a dead end into a way forward.
 *
 * Native state and one parse on submit, not react-hook-form and zod. `PRD.md`
 * §10 is explicit that this route may not carry a form library for a single
 * field, and `/j/[code]` is the tightest bundle budget in the product.
 *
 * Codes are normalised before navigating, so typing them with spaces, in caps,
 * or without hyphens all work — people read these aloud, and the alphabet was
 * chosen for exactly that.
 */
export function JoinCodeForm({
  autoFocus = false,
  variant = "default",
}: {
  autoFocus?: boolean;
  /**
   * v1.3 E3: the landing page inverts its hierarchy when someone is signed in.
   * Signed out, joining by code is the primary action; signed in, "Start a
   * meeting" takes primary and this drops to secondary. Same control, and the
   * button's fill is the only thing that differs.
   */
  variant?: "default" | "secondary";
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  /**
   * v1.3 E3: "The code field validates before enabling Join — `xxx-xxxx-xxx`
   * against the real alphabet. A permanently grey button that does nothing when
   * pressed is worse than no button."
   *
   * `normaliseMeetingCode` rather than a regular expression written here. It is
   * the same function the route handlers and the seed use, so the alphabet
   * cannot drift between what the button accepts and what the server resolves —
   * `CLAUDE.md`'s conventions make that a rule for fixtures and it is a rule for
   * validation too. It also means spaces, capitals and missing hyphens all
   * count as valid, which they are: people read these codes aloud.
   */
  const valid = normaliseMeetingCode(value) !== null;

  /**
   * A full-length code that is still not a code.
   *
   * The disabled button is E3's requirement and it is right, but on its own it
   * is silent: someone who types ten characters containing an `o` or a `1` gets
   * a grey button and no reason. Incomplete input says nothing — that is not an
   * error yet, it is a person still typing — so this waits until they have put
   * in as many characters as a code has.
   *
   * **This replaces a submit-time error that could never fire.** A form whose
   * only submit button is disabled does not perform implicit submission, so
   * pressing Enter did nothing and the branch below was unreachable. The
   * comment that used to sit there asserted the opposite, confidently, and was
   * wrong about the platform.
   *
   * `CODE_LENGTH` from the generator, never a literal 10 — the same rule the
   * fixtures follow.
   */
  const bare = value.trim().toLowerCase().replace(/[\s-]/g, "");
  const malformed = !valid && bare.length >= CODE_LENGTH;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseMeetingCode(value);
    /*
     * A backstop, and named as one. `valid` gates the only submit button, so
     * this is not reachable through the UI — it exists so a future caller, or a
     * change that re-enables the button, cannot navigate to a malformed route.
     */
    if (!code) {
      setError("A meeting code looks like kqr-8mzt-vnp — ten characters.");
      return;
    }
    setError(null);
    router.push(`/j/${code}`);
  }

  return (
    <form
      onSubmit={submit}
      /* 16px between children, matching the card this sits in — the design's
         `.land .card > * + * {margin-top:16px}`. It was 12, so the field and
         its button sat tighter than every other pair on the page. */
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="code" className="type-small">
          Meeting code
        </Label>
        <Input
          id="code"
          name="code"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="kqr-8mzt-vnp"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          /*
           * `size="touch"`, not `className="h-11"` — v1.3 E1.
           *
           * The height is the same 44px and for the same reason: a field is a
           * target, and this one renders on a join surface beside a 44px
           * button. What changed is that it has to come through the prop.
           * `Input` now sets its height from `data-[size=default]:h-8`, which
           * has higher specificity than a bare `h-11` in a caller's class list
           * — so this field silently went back to 32px, and `check:targets`
           * failed on "an unknown code" the same run. It is the trap `Select`'s
           * own comment describes, sprung.
           */
          size="touch"
          className="font-mono tracking-[0.06em]"
          aria-describedby={
            error ? "code-error" : malformed ? "code-hint" : undefined
          }
          aria-invalid={error || malformed ? true : undefined}
        />
      </div>

      {/* Error text sits below the field, on the ground — --state-critical is
          not permitted on --input (4.34:1). See CLAUDE.md's surface table. */}
      {error && (
        <p id="code-error" role="alert" className="type-small text-[var(--state-critical)]">
          {error}
        </p>
      )}

      {/* Live guidance, not an alert: they are mid-task and nothing has failed
          yet. Like the error above it sits below the field on the ground —
          `--state-critical` is not permitted on `--input`. */}
      {!error && malformed && (
        <p id="code-hint" className="type-small text-[var(--state-critical)]">
          A meeting code looks like kqr-8mzt-vnp — no o, i, l, 0 or 1.
        </p>
      )}

      {/* `touch`, though this file is not under components/room or
          components/prejoin: it renders on `/j/[code]`, which is a pre-join
          surface, and on `/`. The floor CLAUDE.md sets is by *surface*, and a
          component can appear on more than one. */}
      {/*
        Disabled until the code is **well-formed**, not merely non-empty — E3.
        It used to enable on the first keystroke, so the button was pressable
        through nine of the ten characters and answered every press with the
        same error.
      */}
      <Button
        size="touch"
        type="submit"
        variant={variant === "secondary" ? "outline" : "default"}
        className="w-full"
        disabled={!valid}
      >
        Join meeting
      </Button>
    </form>
  );
}
