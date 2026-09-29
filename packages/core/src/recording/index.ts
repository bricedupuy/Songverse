/**
 * Recording a part in the browser (issue #123): the arithmetic, kept apart
 * from the audio so it can be tested. The web app plays the click and the
 * multitrack's other parts on one AudioContext and captures the
 * microphone on it too, so every captured sample has a time on the same
 * clock as what was played; what's left is the device's round trip -
 * from a sound being scheduled to its echo being captured - which the
 * app estimates, or measures (`roundTripFrom`).
 */

/** The time signatures offered for a recording. */
export const RECORDING_TIME_SIGNATURES = ["2/4", "3/4", "4/4", "5/4", "6/4", "6/8", "7/8", "9/8", "12/8"] as const;

/** A beat of the click: when (s, on the multitrack's timeline, 0 its start) and whether it starts a bar. */
export interface Click {
  at: number;
  accent: boolean;
}

/**
 * Where a take's timeline starts and its first beat falls. A new
 * multitrack starts with a bar of count-in (its first beat one bar in,
 * so a pickup before beat one is kept); an existing one starts where its
 * files do, with a bar of count-in before its first beat, before its 0:00
 * if need be (`lead`, s).
 */
export function recordingPlan(options: { tempo: number; beatsPerBar: number; firstBeat: number | null }): { firstBeat: number; lead: number } {
  const bar = (60 / options.tempo) * options.beatsPerBar;
  if (options.firstBeat === null) return { firstBeat: round(bar), lead: 0 };
  return { firstBeat: options.firstBeat, lead: Math.max(0, bar - options.firstBeat) };
}

/** The click's beats from `from` to `to` (s, the multitrack's timeline; `from` may be negative, in the count-in). */
export function clickTimes(options: { tempo: number; beatsPerBar: number; firstBeat: number; from: number; to: number }): Click[] {
  const beat = 60 / options.tempo;
  const clicks: Click[] = [];
  const first = Math.ceil((options.from - options.firstBeat) / beat - 1e-9);
  for (let n = first; ; n++) {
    const at = options.firstBeat + n * beat;
    if (at > options.to) break;
    const inBar = ((n % options.beatsPerBar) + options.beatsPerBar) % options.beatsPerBar;
    clicks.push({ at: round(at), accent: inBar === 0 });
  }
  return clicks;
}

/**
 * The take, from the multitrack's 0:00: what was captured, shifted by the
 * round trip. The captured samples start at `capturedAt` (s, audio clock);
 * the timeline's 0:00 was played at `zeroAt`; a note played in time with
 * it is captured `delay` later. Silence where nothing was captured yet.
 */
export function alignTake(captured: Float32Array, options: { sampleRate: number; capturedAt: number; zeroAt: number; delay: number; length?: number }): Float32Array {
  const skip = Math.round((options.zeroAt + options.delay - options.capturedAt) * options.sampleRate);
  const length = options.length ?? Math.max(0, captured.length - skip);
  const take = new Float32Array(length);
  if (skip >= 0) take.set(captured.subarray(skip, skip + length));
  else take.set(captured.subarray(0, Math.max(0, length + skip)), -skip);
  return take;
}

/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return bytes;
}

/**
 * The round trip (s), from clicks played at `playedAt` (s, audio clock)
 * and what the microphone captured from `capturedAt`: for each click, the
 * first sample loud against the quiet before it, within `window` s after;
 * the median of those that were heard. Null when fewer than half were
 * (the microphone didn't hear the speakers: headphones, or too quiet).
 */
export function roundTripFrom(captured: Float32Array, options: { sampleRate: number; capturedAt: number; playedAt: number[]; window?: number }): number | null {
  const window = options.window ?? 0.5;
  const delays: number[] = [];
  for (const played of options.playedAt) {
    const start = Math.max(0, Math.round((played - options.capturedAt) * options.sampleRate));
    const end = Math.min(captured.length, start + Math.round(window * options.sampleRate));
    if (end - start < 64) continue;
    // The quiet: the loudest of the first 5 ms, before any echo can have come back.
    let floor = 0;
    for (let i = start; i < start + Math.round(0.005 * options.sampleRate) && i < end; i++) floor = Math.max(floor, Math.abs(captured[i]!));
    let peak = 0;
    for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(captured[i]!));
    if (peak < 0.02 || peak < floor * 4) continue;
    const threshold = Math.max(floor * 2, peak * 0.3);
    for (let i = start; i < end; i++) {
      if (Math.abs(captured[i]!) >= threshold) {
        delays.push((i - start) / options.sampleRate + Math.max(0, options.capturedAt - played));
        break;
      }
    }
  }
  if (delays.length === 0 || delays.length < options.playedAt.length / 2) return null;
  const sorted = delays.sort((a, b) => a - b);
  return round(sorted[Math.floor(sorted.length / 2)]!);
}

const round = (value: number) => Math.round(value * 100000) / 100000;
