"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { normaliseMeetingCode } from "@/lib/meetings/code";
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
export function JoinCodeForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseMeetingCode(value);
    if (!code) {
      setError("A meeting code looks like kqr-8mzt-vnp — ten characters.");
      return;
    }
    setError(null);
    router.push(`/j/${code}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
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
          className="font-mono tracking-[0.08em]"
          aria-describedby={error ? "code-error" : undefined}
          aria-invalid={error ? true : undefined}
        />
      </div>

      {/* Error text sits below the field, on the ground — --state-critical is
          not permitted on --input (4.34:1). See CLAUDE.md's surface table. */}
      {error && (
        <p id="code-error" role="alert" className="type-small text-[var(--state-critical)]">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={!value.trim()}>
        Join meeting
      </Button>
    </form>
  );
}
