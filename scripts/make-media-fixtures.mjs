#!/usr/bin/env node
/**
 * The audio Chrome's fake capture device plays into the meeting.
 *
 * BUILD-PLAN, Phase 4: "Feed a real WAV to `--use-file-for-fake-audio-capture`
 * rather than using the default tone. The built-in tone is a clean periodic
 * beep and will make any speaking detector look perfect."
 *
 * That is the whole point of this file. A continuous 440 Hz sine crosses any
 * energy threshold instantly and never stops, so a speaking indicator wired to
 * nothing at all would still light up and stay lit. What actually exercises the
 * detector is speech that starts, stops, and is interrupted by a noise that is
 * loud but is not talking.
 *
 * The speech is real speech: macOS ships a synthesiser, so this is formants and
 * prosody rather than a shaped tone. On a machine without `say` — CI on Linux —
 * it falls back to a synthesised approximation and prints that it has, because
 * a fixture that quietly degrades would make the test weaker without saying so.
 *
 * The timeline is built so each assertion has a window to sit in:
 *
 *   0.0 – 4.0   speech          → speaking
 *   4.0 – 7.0   silence         → not speaking
 *   7.0 – 7.2   a cough         → the hysteresis probe (§3.4)
 *   7.2 – 10.0  silence         → still not speaking
 *  10.0 – 14.0  speech          → speaking again
 *
 * Chrome loops the file, so the cycle repeats for as long as a test runs.
 *
 * Run with: npm run fixtures:media
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const RATE = 48000; // WebRTC's native rate; no resampling on the way in.
const OUT = join("e2e", "fixtures", "speech.wav");

/** Pull PCM out of a WAV by walking its chunks — `say` emits JUNK and FLLR padding. */
function pcmOf(buffer) {
  let offset = 12;
  let format = null;
  while (offset < buffer.length - 8) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      format = {
        channels: buffer.readUInt16LE(offset + 10),
        rate: buffer.readUInt32LE(offset + 12),
        bits: buffer.readUInt16LE(offset + 22),
      };
    }
    if (id === "data") {
      if (!format) throw new Error("data chunk before fmt");
      if (format.bits !== 16 || format.channels !== 1 || format.rate !== RATE) {
        throw new Error(`unexpected format: ${JSON.stringify(format)}`);
      }
      return new Int16Array(
        buffer.buffer.slice(
          buffer.byteOffset + offset + 8,
          buffer.byteOffset + offset + 8 + size,
        ),
      );
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

function speak(text) {
  const dir = mkdtempSync(join(tmpdir(), "parley-say-"));
  const path = join(dir, "say.wav");
  try {
    execFileSync("say", ["-o", path, "--data-format=LEI16@48000", text], {
      stdio: "pipe",
    });
    return pcmOf(readFileSync(path));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const silence = (seconds) => new Int16Array(Math.round(seconds * RATE));

/**
 * A cough. Short, loud, broadband, and not speech — which is exactly the case
 * §3.4's smoothing exists for.
 *
 * Noise through a one-pole low-pass for body, with a near-instant attack and a
 * fast exponential decay. A cough's envelope is what distinguishes it from a
 * syllable: speech rises and falls over ~200ms and keeps going, a cough is over
 * before it starts.
 */
function cough(seconds = 0.2) {
  const samples = new Int16Array(Math.round(seconds * RATE));
  let previous = 0;
  // Deterministic: a fixture that differs between runs makes a failure
  // impossible to reproduce. A tiny LCG rather than Math.random().
  let seed = 20260902;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length;
    previous = previous * 0.72 + random() * 0.28;
    const attack = Math.min(1, t / 0.02);
    const decay = Math.exp(-7 * t);
    samples[i] = Math.max(-32768, Math.min(32767, previous * attack * decay * 30000));
  }
  return samples;
}

/** Speech-shaped fallback for machines without `say`. Deliberately not a tone. */
function synthSpeech(seconds) {
  const samples = new Int16Array(Math.round(seconds * RATE));
  let seed = 7717;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  let f1 = 0, f2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / RATE;
    // Syllables at ~4 Hz with gaps between them, the way talking actually goes.
    const syllable = Math.max(0, Math.sin(2 * Math.PI * 4 * t)) ** 2;
    const word = t % 2.2 < 1.6 ? 1 : 0;
    const excitation = random() * 0.4 + Math.sin(2 * Math.PI * 120 * t) * 0.6;
    f1 = f1 * 0.86 + excitation * 0.14;   // ~700 Hz formant region
    f2 = f2 * 0.55 + excitation * 0.45;   // ~1.8 kHz
    samples[i] = (f1 * 0.7 + f2 * 0.3) * syllable * word * 22000;
  }
  return samples;
}

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A canonical RIFF/fmt/data WAV. Chrome's parser wants no surprises. */
function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);            // PCM
  header.writeUInt16LE(1, 22);            // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);     // byte rate
  header.writeUInt16LE(2, 32);            // block align
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.byteLength, 40);
  return Buffer.concat([header, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]);
}

/** Pad or trim a clip to an exact length so the timeline above stays true. */
function fit(pcm, seconds) {
  const target = Math.round(seconds * RATE);
  const out = new Int16Array(target);
  out.set(pcm.subarray(0, Math.min(pcm.length, target)));
  return out;
}

let real = true;
let first, second;
try {
  first = speak(
    "Right. Shall we start? I have the numbers from last week, and they are better than we expected.",
  );
  second = speak(
    "One more thing before we finish. Can somebody take a look at the second chart?",
  );
} catch {
  real = false;
  first = synthSpeech(4);
  second = synthSpeech(4);
}

const timeline = concat([
  fit(first, 4),
  silence(3),
  cough(0.2),
  silence(2.8),
  fit(second, 4),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, wav(timeline));

const seconds = (timeline.length / RATE).toFixed(1);
console.log(`${OUT} — ${seconds}s, 16-bit mono ${RATE} Hz`);
console.log(
  real
    ? "  speech: macOS `say` (real formants and prosody)"
    : "  speech: SYNTHESISED — `say` unavailable, so the detector is being fed an\n" +
      "  approximation rather than real speech. Weaker, and noted rather than hidden.",
);
console.log("  timeline: 0–4s speech · 4–7s silence · 7s cough · 7.2–10s silence · 10–14s speech");
