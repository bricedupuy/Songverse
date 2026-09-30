/**
 * The metronome's timeline (issue #2), apart from any way of playing it, so
 * the web app's Web Audio engine, Web MIDI (#98), Sync play (#13) and a
 * headless device (#62) all read the same beats.
 *
 * Positions are in beats of the time signature (a 6/8 bar is six beats,
 * each an eighth note) counted from the start, count-in included; the tempo
 * counts those beats. Ticks are MIDI's: 480 to a quarter note. A click is a
 * note on channel 10, General MIDI's drums, as a MIDI renderer will send it.
 */

/** Ticks to a quarter note, as in a Standard MIDI File. */
export const PPQ = 480;
export const METRONOME_CHANNEL = 10;
/** General MIDI's metronome bell (a bar's first beat) and click. */
export const METRONOME_NOTES = { accent: 34, normal: 33, sub: 33 } as const;

export const MIN_TEMPO = 20;
export const MAX_TEMPO = 300;
export const METRONOME_DENOMINATORS = [2, 4, 8, 16] as const;
export const MAX_BEATS_PER_BAR = 16;
export const METRONOME_SOUNDS = ["click", "wood", "beep"] as const;

/** How a beat sounds: accented, as usual, or not at all. */
export type BeatLevel = "accent" | "normal" | "mute";
/** Clicks per beat: 1, eighths (2), triplets (3), sixteenths (4). */
export type Subdivision = 1 | 2 | 3 | 4;
export type MetronomeSound = (typeof METRONOME_SOUNDS)[number];

export interface MetronomeSettings {
  /** Beats a minute, of the time signature's beat. */
  tempo: number;
  numerator: number;
  denominator: number;
  /** One per beat of the bar: the pattern. */
  beats: BeatLevel[];
  subdivision: Subdivision;
  /** Bars counted in before the song starts. */
  countIn: number;
  /** Silent once the count-in is over: the beat still shows. */
  countInOnly: boolean;
  sound: MetronomeSound;
  /** 0-1. */
  volume: number;
}

export const DEFAULT_METRONOME: MetronomeSettings = {
  tempo: 100,
  numerator: 4,
  denominator: 4,
  beats: ["accent", "normal", "normal", "normal"],
  subdivision: 1,
  countIn: 0,
  countInOnly: false,
  sound: "click",
  volume: 0.8,
};

/** A tempo in range, in whole beats per minute - or, `fine`, to the hundredth: stems slowed to 85% of 97 BPM beat at 82.45 (issue #139). */
export function clampTempo(tempo: number, fine = false): number {
  if (!Number.isFinite(tempo)) return DEFAULT_METRONOME.tempo;
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, fine ? Math.round(tempo * 100) / 100 : Math.round(tempo)));
}

/** A bar's usual pattern: its first beat accented. */
export function defaultBeats(numerator: number): BeatLevel[] {
  return Array.from({ length: numerator }, (_, i) => (i === 0 ? "accent" : "normal"));
}

/** Settings made whole and valid, from whatever was stored or asked for. */
export function normalizeMetronome(input: Partial<MetronomeSettings> | null | undefined): MetronomeSettings {
  const value = input ?? {};
  const numerator = Number.isInteger(value.numerator) ? Math.min(MAX_BEATS_PER_BAR, Math.max(1, value.numerator!)) : DEFAULT_METRONOME.numerator;
  const denominator = (METRONOME_DENOMINATORS as readonly number[]).includes(value.denominator ?? 0) ? value.denominator! : DEFAULT_METRONOME.denominator;
  const levels: BeatLevel[] = ["accent", "normal", "mute"];
  const beats =
    Array.isArray(value.beats) && value.beats.length === numerator && value.beats.every((beat) => levels.includes(beat)) ? [...value.beats] : defaultBeats(numerator);
  return {
    tempo: clampTempo(value.tempo ?? DEFAULT_METRONOME.tempo, true),
    numerator,
    denominator,
    beats,
    subdivision: ([1, 2, 3, 4] as const).includes(value.subdivision as Subdivision) ? (value.subdivision as Subdivision) : 1,
    countIn: Number.isInteger(value.countIn) ? Math.min(4, Math.max(0, value.countIn!)) : 0,
    countInOnly: !!value.countInOnly && Number.isInteger(value.countIn) && value.countIn! > 0,
    sound: (METRONOME_SOUNDS as readonly string[]).includes(value.sound ?? "") ? value.sound! : DEFAULT_METRONOME.sound,
    volume: typeof value.volume === "number" && Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : DEFAULT_METRONOME.volume,
  };
}

/** A song's tempo and time signature on top of the player's own settings (their pattern kept when the bar is the same length). */
export function metronomeForSong(
  current: MetronomeSettings,
  song: { tempo: number | null | undefined; timeSignature?: { numerator: number; denominator: number } | null },
): MetronomeSettings {
  const numerator = song.timeSignature?.numerator ?? current.numerator;
  return normalizeMetronome({
    ...current,
    tempo: song.tempo ?? current.tempo,
    numerator,
    denominator: song.timeSignature?.denominator ?? current.denominator,
    beats: numerator === current.numerator ? current.beats : defaultBeats(numerator),
  });
}

export const secondsPerBeat = (settings: Pick<MetronomeSettings, "tempo">) => 60 / settings.tempo;
export const ticksPerBeat = (settings: Pick<MetronomeSettings, "denominator">) => (PPQ * 4) / settings.denominator;

/** One click: where it falls, and how it sounds. */
export interface MetronomeClick {
  /** In beats from the start (count-in included); a subdivision falls between. */
  position: number;
  tick: number;
  /** 0-based; negative during the count-in (-1 is the bar before the song). */
  bar: number;
  /** 0-based beat of the bar. */
  beat: number;
  /** 0 on the beat, then 1, 2… for the subdivisions. */
  sub: number;
  level: "accent" | "normal" | "sub";
  note: number;
  channel: number;
  /** 1-127, as MIDI's. */
  velocity: number;
  countIn: boolean;
}

const VELOCITY = { accent: 120, normal: 90, sub: 60 } as const;

/** Where a position in beats falls: its bar (negative in the count-in), beat, and how far through the beat. */
export function beatAt(settings: Pick<MetronomeSettings, "numerator" | "countIn">, position: number): { bar: number; beat: number; fraction: number } {
  const whole = Math.floor(position);
  return {
    bar: Math.floor(whole / settings.numerator) - settings.countIn,
    beat: ((whole % settings.numerator) + settings.numerator) % settings.numerator,
    fraction: position - whole,
  };
}

/**
 * The clicks from `from` (included) to `to` (not), in beats. A muted beat
 * mutes its subdivisions; during the count-in every beat sounds, the first
 * of each bar accented, without subdivisions; after it, with `countInOnly`,
 * nothing does.
 */
export function clicksBetween(settings: MetronomeSettings, from: number, to: number): MetronomeClick[] {
  const clicks: MetronomeClick[] = [];
  const step = 1 / settings.subdivision;
  // Index of the first subdivision at or after `from`, exactly (no float drift over hours).
  let index = Math.max(0, Math.ceil(from * settings.subdivision - 1e-9));
  for (; index / settings.subdivision < to; index++) {
    const position = index * step;
    const whole = Math.floor(index / settings.subdivision);
    const sub = index % settings.subdivision;
    const { bar, beat } = beatAt(settings, whole);
    const countIn = bar < 0;
    let level: MetronomeClick["level"] | null;
    if (countIn) level = sub === 0 ? (beat === 0 ? "accent" : "normal") : null;
    else if (settings.countInOnly) level = null;
    else if (settings.beats[beat] === "mute") level = null;
    else level = sub === 0 ? (settings.beats[beat] === "accent" ? "accent" : "normal") : "sub";
    if (!level) continue;
    clicks.push({
      position,
      tick: Math.round(position * ticksPerBeat(settings)),
      bar,
      beat,
      sub,
      level,
      note: METRONOME_NOTES[level],
      channel: METRONOME_CHANNEL,
      velocity: VELOCITY[level],
      countIn,
    });
  }
  return clicks;
}

/** A tap tempo: beats a minute from the times of the last taps (ms), or null until there are two close enough. */
export function tapTempo(taps: number[]): number | null {
  // A pause of more than two seconds starts again.
  const recent: number[] = [];
  for (const tap of taps) {
    if (recent.length && tap - recent[recent.length - 1]! > 2000) recent.length = 0;
    recent.push(tap);
  }
  const last = recent.slice(-6);
  if (last.length < 2) return null;
  const average = (last[last.length - 1]! - last[0]!) / (last.length - 1);
  return average > 0 ? clampTempo(60000 / average) : null;
}
