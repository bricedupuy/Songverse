import { parseChord, semitoneOf } from "./chord.js";
import { chordTones } from "./shapes.js";

/**
 * Piano voicings (issue #207, phase 4): which keys to play for a chord, worked
 * out from its notes like the fretted shapes - the right hand's chord in close
 * position near middle C, each inversion an alternative, and the left hand's
 * bass (the root, or a slash chord's bass) below it. Plain data, drawn by
 * each platform its own way (docs/chord-diagrams.md).
 */

export interface PianoVoicing {
  /** The left hand's keys, MIDI notes (the bass), lowest first; empty for the right hand only. */
  left: number[];
  /** The right hand's keys, MIDI notes, lowest first. */
  right: number[];
  /** 0 for root position, 1 for the first inversion (the 3rd lowest)... */
  inversion: number;
}

export interface PianoOptions {
  /** Both hands (the default), or the right hand only - when a bassist covers the bass. */
  hands?: "both" | "right";
}

// The right hand sits around E4 (MIDI 64), within C4-C6; the left hand's bass in C3-B3.
const RIGHT_CENTER = 66;
const RIGHT_LOW = 60;
const LEFT_LOW = 48;
/** More notes than this and the optional ones (the 5th, implied extensions) are left out. */
const MAX_RIGHT = 4;

const cache = new Map<string, PianoVoicing[]>();

/**
 * The chord's voicings: root position first, then each inversion, the right
 * hand placed nearest middle C (above the left hand's bass). Empty for
 * something that isn't a chord.
 */
export function pianoVoicings(chord: string, options: PianoOptions = {}): PianoVoicing[] {
  const hands = options.hands ?? "both";
  const key = `${hands}|${chord.trim()}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const parsed = parseChord(chord);
  const tones = parsed && parsed.kind === "chord" ? chordTones(parsed) : null;
  let voicings: PianoVoicing[] = [];
  if (parsed && parsed.kind === "chord" && tones) {
    const root = semitoneOf(parsed.root);
    const bass = parsed.bass ? semitoneOf(parsed.bass) : root;
    // The right hand plays the chord's own notes (not a slash chord's foreign bass), the optional ones while there's room.
    let chordTones_ = tones.filter((tone) => tone.role !== "bass");
    while (chordTones_.length > MAX_RIGHT && chordTones_.some((tone) => !tone.needed)) {
      const drop = [...chordTones_].reverse().find((tone) => !tone.needed)!;
      chordTones_ = chordTones_.filter((tone) => tone !== drop);
    }
    const intervals = [...new Set(chordTones_.map((tone) => tone.interval))].sort((a, b) => a - b);
    const left = hands === "both" ? [LEFT_LOW + ((bass - LEFT_LOW) % 12 + 12) % 12] : [];
    voicings = intervals.map((_, inversion) => {
      // Stacked upwards from the inversion's lowest note.
      const order = [...intervals.slice(inversion), ...intervals.slice(0, inversion).map((interval) => interval + 12)];
      const relative = order.map((interval) => interval - order[0]!);
      const lowestClass = (root + order[0]!) % 12;
      // The octave that puts the hand's middle nearest RIGHT_CENTER, never below RIGHT_LOW or on the bass.
      const span = relative.at(-1)!;
      let lowest = RIGHT_LOW + ((lowestClass - RIGHT_LOW) % 12 + 12) % 12;
      while (Math.abs(lowest + 12 + span / 2 - RIGHT_CENTER) < Math.abs(lowest + span / 2 - RIGHT_CENTER)) lowest += 12;
      if (left.length > 0) while (lowest <= left[0]!) lowest += 12;
      return { left, right: relative.map((step) => lowest + step), inversion };
    });
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, voicings);
  return voicings;
}

/** How far a hand moves from one voicing to the next: each key's distance to the nearest of the others. */
function movement(from: number[], to: number[]): number {
  return to.reduce((sum, note) => sum + Math.min(...from.map((other) => Math.abs(other - note))), 0);
}

/**
 * For a run of chords (a song's, in the order they're played), which voicing
 * of each to play: `smooth`, the inversion nearest the chord before - as a
 * keyboard player voices them, the hand hardly moving - starting from the
 * first chord's root position; otherwise root position throughout. The index
 * into pianoVoicings(chord) for each chord, in order.
 */
export function songVoicings(chords: string[], options: PianoOptions & { smooth?: boolean } = {}): number[] {
  let previous: number[] | null = null;
  return chords.map((chord) => {
    const voicings = pianoVoicings(chord, options);
    if (voicings.length === 0) return 0;
    let best = 0;
    if (options.smooth !== false && previous) {
      let least = Infinity;
      voicings.forEach((voicing, i) => {
        const cost = movement(previous!, voicing.right);
        if (cost < least) {
          least = cost;
          best = i;
        }
      });
    }
    previous = voicings[best]!.right;
    return best;
  });
}

/** A voicing written down, to keep a player's choice: "48|60.64.67" (left hand | right hand, MIDI notes). */
export function voicingText(voicing: Pick<PianoVoicing, "left" | "right">): string {
  return `${voicing.left.join(".")}|${voicing.right.join(".")}`;
}
