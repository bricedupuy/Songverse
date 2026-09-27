import { beatAt, clicksBetween, normalizeMetronome, secondsPerBeat, type MetronomeClick, type MetronomeSettings, type MetronomeSound } from "@songverse/core";
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The metronome's sound (issue #2), kept outside any page like the stem
 * player, so it keeps time while the user moves around the app: one per
 * tab. It plays the timeline `@songverse/core` gives (clicksBetween), which a
 * MIDI renderer (#98) or Sync play (#13) read the same way.
 *
 * Clicks are scheduled a little ahead on the audio clock, never fired by
 * timers, which drift and stall when the page is busy: a timer only tops up
 * what's scheduled. Where the beat is comes from the same clock, so what's
 * shown is what's heard (less the device's output delay).
 */

const STORAGE_KEY = "songverse.metronome";
/** How far ahead clicks are scheduled: a hidden tab's timers slow to one a second, so much further then. */
const LOOKAHEAD = 0.15;
const HIDDEN_LOOKAHEAD = 1.5;
const TICK_MS = 25;
/** Time to start after a press, so the first click isn't late. */
const START_DELAY = 0.08;

export interface MetronomeState {
  settings: MetronomeSettings;
  playing: boolean;
  /** Its settings came from this song (a Live, Practice or song page button), else null. */
  songId: string | null;
}

let state: MetronomeState = { settings: normalizeMetronome(null), playing: false, songId: null };
let loaded = false;
const listeners = new Set<() => void>();

function emit(next: Partial<MetronomeState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

/** The player's settings, from the last time (in the browser only: the server can't know them). */
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) state = { ...state, settings: normalizeMetronome(JSON.parse(stored) as Partial<MetronomeSettings>) };
  } catch {
    // Storage blocked or unreadable: the defaults.
  }
}

function save(settings: MetronomeSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: they last for this page.
  }
}

// --- audio

let context: AudioContext | null = null;
let output: GainNode | null = null;
let buffers: Map<string, AudioBuffer> | null = null;
/** Where the timeline was anchored: position `anchorPosition` (beats) at `anchorTime` on the audio clock. */
let anchorTime = 0;
let anchorPosition = 0;
/** Scheduled up to here, in beats. */
let scheduledUntil = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let scheduled: { source: AudioBufferSourceNode; time: number }[] = [];

/** The clicks' sounds, made here rather than downloaded: a sound per level, for each kind. */
function makeBuffers(ctx: AudioContext): Map<string, AudioBuffer> {
  const made = new Map<string, AudioBuffer>();
  const rate = ctx.sampleRate;
  const shapes: Record<MetronomeSound, { partials: [number, number][]; length: number; decay: number; square?: boolean }> = {
    // A short, bright tick.
    click: { partials: [[1, 1]], length: 0.03, decay: 0.006 },
    // Two inharmonic partials, dying fast: a wood block.
    wood: { partials: [[1, 1], [1.58, 0.5]], length: 0.05, decay: 0.012 },
    beep: { partials: [[1, 1]], length: 0.07, decay: 0.05, square: true },
  };
  const pitch: Record<MetronomeSound, Record<MetronomeClick["level"], number>> = {
    click: { accent: 2000, normal: 1400, sub: 1100 },
    wood: { accent: 1250, normal: 900, sub: 760 },
    beep: { accent: 1320, normal: 880, sub: 660 },
  };
  const loudness: Record<MetronomeClick["level"], number> = { accent: 1, normal: 0.7, sub: 0.4 };
  for (const [sound, shape] of Object.entries(shapes) as [MetronomeSound, (typeof shapes)[MetronomeSound]][]) {
    for (const level of ["accent", "normal", "sub"] as const) {
      const buffer = ctx.createBuffer(1, Math.ceil(shape.length * rate), rate);
      const data = buffer.getChannelData(0);
      const frequency = pitch[sound][level];
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        let value = 0;
        for (const [ratio, gain] of shape.partials) {
          const wave = Math.sin(2 * Math.PI * frequency * ratio * t);
          value += gain * (shape.square ? Math.sign(wave) * 0.35 : wave);
        }
        // A millisecond's attack, no click at the start; then the decay, to nothing at the end.
        const envelope = Math.min(1, t / 0.001) * Math.exp(-t / shape.decay) * (1 - i / data.length);
        data[i] = value * envelope * loudness[level] * 0.6;
      }
      made.set(`${sound}:${level}`, buffer);
    }
  }
  return made;
}

function audio(): AudioContext {
  if (!context) {
    context = new AudioContext({ latencyHint: "interactive" });
    output = context.createGain();
    output.connect(context.destination);
    buffers = makeBuffers(context);
  }
  return context;
}

/** Where the beat is on the audio clock, in beats from the start. */
function positionAt(time: number): number {
  return anchorPosition + (time - anchorTime) / secondsPerBeat(state.settings);
}
function timeOf(position: number): number {
  return anchorTime + (position - anchorPosition) * secondsPerBeat(state.settings);
}

/** For the end-to-end suites, which can't hear it: the last clicks scheduled, on the audio clock. */
interface MetronomeProbe {
  clicks: (Pick<MetronomeClick, "position" | "bar" | "beat" | "sub" | "level"> & { time: number })[];
  now: () => number;
}
function probe(): MetronomeProbe | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { songverseMetronome?: MetronomeProbe };
  w.songverseMetronome ??= { clicks: [], now: () => context?.currentTime ?? 0 };
  return w.songverseMetronome;
}

function schedule() {
  const ctx = context;
  if (!ctx || !output || !buffers || !state.playing) return;
  const horizon = ctx.currentTime + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
  const until = positionAt(horizon);
  const log = probe();
  for (const click of clicksBetween(state.settings, scheduledUntil, until)) {
    const time = timeOf(click.position);
    if (time < ctx.currentTime) continue;
    const source = ctx.createBufferSource();
    source.buffer = buffers.get(`${state.settings.sound}:${click.level}`)!;
    source.connect(output);
    source.start(time);
    scheduled.push({ source, time });
    log?.clicks.push({ time, position: click.position, bar: click.bar, beat: click.beat, sub: click.sub, level: click.level });
  }
  if (log && log.clicks.length > 200) log.clicks.splice(0, log.clicks.length - 200);
  scheduledUntil = Math.max(scheduledUntil, until);
  scheduled = scheduled.filter((entry) => entry.time > ctx.currentTime - 1);
}

/** Silences what's scheduled from `time` on. */
function cancelFrom(time: number) {
  scheduled = scheduled.filter((entry) => {
    if (entry.time < time - 0.001) return true;
    try {
      entry.source.stop();
    } catch {
      // Not started, or over.
    }
    entry.source.disconnect();
    return false;
  });
  const log = probe();
  if (log) log.clicks = log.clicks.filter((click) => click.time < time - 0.001);
}

// --- what pages call

/** Starts from the top (count-in first), with these settings if given; from a song's button, `songId` says which. */
export function startMetronome(settings?: MetronomeSettings, songId: string | null = null) {
  load();
  const ctx = audio();
  // Within the press: browsers only let sound start from one.
  void ctx.resume();
  if (state.playing) cancelFrom(0);
  const next = settings ? normalizeMetronome(settings) : state.settings;
  if (settings) save(next);
  output!.gain.value = next.volume;
  anchorTime = ctx.currentTime + START_DELAY;
  anchorPosition = 0;
  scheduledUntil = 0;
  emit({ settings: next, playing: true, songId });
  timer ??= setInterval(schedule, TICK_MS);
  schedule();
}

export function stopMetronome() {
  if (timer) clearInterval(timer);
  timer = null;
  cancelFrom(0);
  if (state.playing) emit({ playing: false });
}

/** New settings, kept; while it plays, from the next beat (or, for a new bar length, a new bar there). */
export function updateMetronome(change: Partial<MetronomeSettings>) {
  load();
  const previous = state.settings;
  const next = normalizeMetronome({ ...previous, ...change });
  save(next);
  if (!state.playing || !context) return emit({ settings: next, songId: null });
  output!.gain.value = next.volume;
  const timing = (["tempo", "numerator", "denominator", "beats", "subdivision", "countIn", "countInOnly", "sound"] as const).some(
    (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
  );
  if (!timing) return emit({ settings: next });
  const nextBeat = Math.floor(positionAt(context.currentTime)) + 1;
  const at = timeOf(nextBeat);
  cancelFrom(at);
  const oldCount = previous.countIn * previous.numerator;
  const newCount = next.countIn * next.numerator;
  anchorTime = at;
  if (nextBeat < oldCount) {
    // In the count-in: it carries on, or starts again for another one.
    anchorPosition = next.countIn === previous.countIn && next.numerator === previous.numerator ? nextBeat : 0;
  } else if (next.numerator === previous.numerator) {
    anchorPosition = nextBeat - oldCount + newCount;
  } else {
    // Another bar length: a new bar, on the next beat.
    anchorPosition = newCount + (Math.floor((nextBeat - oldCount) / previous.numerator) + 1) * next.numerator;
  }
  scheduledUntil = anchorPosition;
  emit({ settings: next, songId: null });
  schedule();
}

/** The latest settings and whether it plays. */
export function useMetronome(): MetronomeState {
  return useSyncExternalStore(
    (listener) => {
      load();
      listeners.add(listener);
      // Loaded after the first render: show the stored settings.
      listener();
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

export interface MetronomeBeat {
  /** Negative during the count-in. */
  bar: number;
  beat: number;
  /** Counts beats, to restart a flash on each. */
  count: number;
  countIn: boolean;
}

/** Where the beat is now, as heard (the output's delay allowed for), updated on each beat; null when it's stopped. */
export function useMetronomeBeat(): MetronomeBeat | null {
  const { playing, settings } = useMetronome();
  const [current, setCurrent] = useState<MetronomeBeat | null>(null);
  useEffect(() => {
    if (!playing || !context) {
      setCurrent(null);
      return;
    }
    const ctx = context;
    let last = -1;
    let frame = requestAnimationFrame(function step() {
      const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
      const position = positionAt(heard);
      if (position >= 0) {
        const whole = Math.floor(position);
        if (whole !== last) {
          last = whole;
          const { bar, beat } = beatAt(settings, whole);
          setCurrent({ bar, beat, count: whole, countIn: bar < 0 });
        }
      }
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, settings]);
  return current;
}
