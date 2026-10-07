import { nashvilleChord, parseChord, simplifyChord } from "./chord.js";
import type { SongDocumentV2 } from "../schemas/song-document-v2.js";

/**
 * Chord progressions (issue #204, phase 5 of #207): a song's chords as
 * Nashville degrees of its key, so songs can be found and compared whatever
 * key they're in - "1 5 6m 4", or songs that move like this one. Worked out
 * from the chart, never stored in it.
 */

/** One section's progression: its chords as degrees, each change once (G G C G → 1 4 1). */
export interface SectionProgression {
  sectionId: string;
  type: string;
  label: string | null;
  degrees: string[];
}

/**
 * A chord as a degree for matching: its triad only (no 7ths, extensions or
 * slash bass - G7/B and G are both "5"), relative to the key. Null for
 * anything that isn't a chord.
 */
export function progressionDegree(raw: string, key: string): string | null {
  const parsed = parseChord(raw);
  if (!parsed || parsed.kind !== "chord") return null;
  const triad = simplifyChord(raw.replace(/^\((.*)\)$/, "$1"), { dropExtensions: true, dropBass: true });
  return nashvilleChord(triad, key);
}

/**
 * Each section's progression, in the song's key: chord changes in order,
 * repeats collapsed. Chords are stored in the song's key, so a key change
 * later in the song doesn't change its degrees. Empty when the song has no
 * key it can read.
 */
export function songProgressions(doc: Pick<SongDocumentV2, "sections" | "defaults">): SectionProgression[] {
  const key = doc.defaults.key;
  if (!key || !/^\s*[A-G]/i.test(key)) return [];
  return doc.sections
    .map((section) => {
      const degrees: string[] = [];
      for (const line of section.lines) {
        for (const chord of line.chords) {
          const degree = progressionDegree(chord.raw, key);
          if (degree && degree !== degrees.at(-1)) degrees.push(degree);
        }
      }
      return { sectionId: section.id, type: section.type, label: section.label ?? null, degrees };
    })
    .filter((section) => section.degrees.length > 0);
}

/**
 * The runs of 3 and 4 chords in a song's sections (a section read as a loop,
 * as progressions are played: 1 5 6m 4 also gives 4 1 5), each once: what
 * songs are compared by. Written "1-5-6m".
 */
export function progressionGrams(sections: Pick<SectionProgression, "degrees">[]): string[] {
  const grams = new Set<string>();
  for (const { degrees } of sections) {
    const loop = degrees.length > 2 && degrees[0] === degrees.at(-1) ? degrees.slice(0, -1) : degrees;
    for (const size of [3, 4]) {
      if (loop.length < size) continue;
      // Around the loop when the section is longer than the run.
      const ring = [...loop, ...loop.slice(0, size - 1)];
      for (let i = 0; i + size <= ring.length; i++) {
        const gram = ring.slice(i, i + size);
        // A run that only goes back and forth (1 4 1) says little.
        if (new Set(gram).size < 2) continue;
        grams.add(gram.join("-"));
      }
    }
  }
  return [...grams].sort();
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };

/**
 * What someone typed to search by progression, as degrees: "1 5 6m 4",
 * "1-5-6-4", "I V vi IV" (lowercase numerals are minor), "1 b7 4". A plain
 * 6 or 2 or 3 is minor, as in the key's own chords. Null for something that
 * isn't a progression.
 */
export function parseProgressionQuery(text: string): string[] | null {
  const parts = text
    .trim()
    .split(/[\s,–—>|]+|(?<=\w)-(?=[#b♭♯]?[1-7ivIV])/)
    .filter(Boolean);
  if (parts.length < 2) return null;
  const degrees: string[] = [];
  for (const part of parts) {
    // A 7th or extension typed (2m7, V7) is fine: songs are matched by their triads.
    const match = /^([#b♭♯]?)([1-7]|[ivIV]{1,3})(m|min|-|°|dim|sus[24]?|aug|\+)?(?:maj7|M7|7|9|11|13)?$/.exec(part);
    if (!match) return null;
    const accidental = match[1]!.replace("♭", "b").replace("♯", "#");
    const numeral = match[2]!;
    let number = Number(numeral);
    let minor: boolean;
    if (Number.isNaN(number)) {
      number = ROMAN[numeral.toLowerCase()] ?? 0;
      if (!number) return null;
      minor = numeral === numeral.toLowerCase();
    } else {
      minor = !accidental && (number === 2 || number === 3 || number === 6);
    }
    const quality = match[3];
    const suffix =
      quality === "m" || quality === "min" || quality === "-"
        ? "m"
        : quality === "°" || quality === "dim"
          ? "dim"
          : quality?.startsWith("sus")
            ? quality === "sus" ? "sus4" : quality
            : quality === "aug" || quality === "+"
              ? "aug"
              : minor && !quality
                ? "m"
                : "";
    degrees.push(`${accidental}${number}${suffix}`);
  }
  return degrees;
}

/**
 * Where a progression is in a song's sections: each section whose chords
 * (read as a loop) contain it in order. Empty when it isn't there.
 */
export function findProgression(sections: SectionProgression[], query: string[]): SectionProgression[] {
  if (query.length === 0) return [];
  return sections.filter(({ degrees }) => {
    // Read as a loop (a section's last chord leading back to its first), unless it starts and ends on the same chord.
    const loop = degrees.length > 2 && degrees[0] === degrees.at(-1) ? degrees.slice(0, -1) : degrees;
    const ring = loop.length >= query.length ? [...loop, ...loop.slice(0, query.length - 1)] : loop;
    for (let i = 0; i + query.length <= ring.length; i++) {
      if (query.every((degree, k) => ring[i + k] === degree)) return true;
    }
    return false;
  });
}

/**
 * How alike two songs' progressions are, 0 to 1: the runs they share,
 * each weighted by how rare it is (`weight`: 1 for a run found everywhere,
 * like 1-4-5, more for a distinctive one), over all of both songs' runs.
 */
export function progressionSimilarity(a: string[], b: string[], weight: (gram: string) => number = () => 1): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(b);
  let shared = 0;
  let all = 0;
  for (const gram of new Set([...a, ...b])) {
    const w = weight(gram);
    all += w;
    if (set.has(gram) && a.includes(gram)) shared += w;
  }
  return all === 0 ? 0 : shared / all;
}
