import { describe, expect, it } from "vitest";
import { formatChord, keyUsesFlats, parseChord, sameChord, simplifyChord, transposeChord } from "../chords/chord.js";

const shape = (raw: string) => {
  const chord = parseChord(raw);
  if (!chord || chord.kind !== "chord") return chord?.kind ?? null;
  const note = (n: { letter: string; accidental: string | null }) => n.letter + (n.accidental === "sharp" ? "#" : n.accidental === "flat" ? "b" : "");
  return [
    note(chord.root),
    chord.quality,
    chord.seventh ?? "-",
    chord.extensions.join(",") || "-",
    chord.alterations.join(",") || "-",
    chord.bass ? note(chord.bass) : "-",
  ].join(" ");
};

describe("parseChord", () => {
  it.each([
    ["C", "C major - - - -"],
    ["Cm", "C minor - - - -"],
    ["C-", "C minor - - - -"],
    ["Cmin", "C minor - - - -"],
    ["C7", "C major minor - - -"],
    ["Cmaj7", "C major major - - -"],
    ["CM7", "C major major - - -"],
    ["CΔ7", "C major major - - -"],
    ["Cm7", "C minor minor - - -"],
    ["CmM7", "C minor major - - -"],
    ["Cm(maj7)", "C minor major - - -"],
    ["Cdim", "C diminished - - - -"],
    ["C°7", "C diminished diminished - - -"],
    ["Cm7b5", "C half-diminished minor - - -"],
    ["Cø", "C half-diminished minor - - -"],
    ["Caug", "C augmented - - - -"],
    ["C+", "C augmented - - - -"],
    ["Csus", "C sus4 - - - -"],
    ["Csus2", "C sus2 - - - -"],
    ["C7sus4", "C sus4 minor - - -"],
    ["C6", "C major - 6 - -"],
    ["C69", "C major - 6,9 - -"],
    ["C6/9", "C major - 6,9 - -"],
    ["C9", "C major minor 9 - -"],
    ["Cmaj9", "C major major 9 - -"],
    ["Cm11", "C minor minor 11 - -"],
    ["C13", "C major minor 13 - -"],
    ["Cadd9", "C major - add9 - -"],
    ["C(add9)", "C major - add9 - -"],
    ["C2", "C major - add2 - -"],
    ["C5", "C power - - - -"],
    ["C7b9", "C major minor - b9 -"],
    ["C7(#9)", "C major minor - #9 -"],
    ["C7#5", "C major minor - #5 -"],
    ["D/F#", "D major - - - F#"],
    ["Bb/D", "Bb major - - - D"],
    ["F#m7b5/C", "F# half-diminished minor - - C"],
    ["Ebm", "Eb minor - - - -"],
    ["N.C.", "no-chord"],
    ["NC", "no-chord"],
  ])("%s", (raw, expected) => {
    expect(shape(raw)).toBe(expected);
  });

  it("marks a chord in parentheses as optional", () => {
    expect(parseChord("(G)")).toMatchObject({ kind: "chord", optional: true });
    expect(parseChord("G")).toMatchObject({ optional: false });
  });

  it("returns null for what it can't read", () => {
    for (const raw of ["H", "x2", "Cfoo", "", "|"]) expect(parseChord(raw)).toBeNull();
  });
});

describe("transposeChord", () => {
  it("moves the root and bass, keeping the rest as written", () => {
    expect(transposeChord("D/F#", 3, "Bb")).toBe("F/A");
    expect(transposeChord("Cadd9", 2, "D")).toBe("Dadd9");
    expect(transposeChord("F#m7b5/C", 1, "G")).toBe("Gm7b5/C#");
    expect(transposeChord("(G)", 2, "A")).toBe("(A)");
  });

  it("spells for the target key", () => {
    expect(transposeChord("G", 1, "Ab")).toBe("Ab");
    expect(transposeChord("G", 1, "G#m")).toBe("G#");
    expect(transposeChord("A", 1)).toBe("A#");
  });

  it("leaves what isn't a chord, and a full octave, alone", () => {
    expect(transposeChord("N.C.", 3, "C")).toBe("N.C.");
    expect(transposeChord("x2", 3, "C")).toBe("x2");
    expect(transposeChord("Em7", 12, "C")).toBe("Em7");
  });
});

describe("keyUsesFlats", () => {
  it.each([
    ["F", true],
    ["Bb", true],
    ["Dm", true],
    ["Gb", true],
    ["G", false],
    ["C#m", false],
    ["E", false],
  ])("%s", (key, flats) => {
    expect(keyUsesFlats(key)).toBe(flats);
  });
});

describe("formatChord", () => {
  it("names notes in solfège", () => {
    expect(formatChord("G/B", "solfege")).toBe("Sol/Si");
    expect(formatChord("F#m7", "solfege")).toBe("Fa#m7");
    expect(formatChord("Bb", "english")).toBe("Bb");
  });
});

describe("simplifyChord", () => {
  it("keeps the triad, and drops the bass when asked", () => {
    expect(simplifyChord("Gmaj7", { dropExtensions: true })).toBe("G");
    expect(simplifyChord("Em7", { dropExtensions: true })).toBe("Em");
    expect(simplifyChord("Bm7b5", { dropExtensions: true })).toBe("Bdim");
    expect(simplifyChord("Csus4", { dropExtensions: true })).toBe("Csus4");
    expect(simplifyChord("D/F#", { dropBass: true })).toBe("D");
    expect(simplifyChord("Am7/G", { dropExtensions: true, dropBass: true })).toBe("Am");
    expect(simplifyChord("x2", { dropExtensions: true })).toBe("x2");
  });
});

describe("sameChord", () => {
  it("compares sound, not spelling", () => {
    expect(sameChord("A#m", "Bbm")).toBe(true);
    expect(sameChord("Cmaj7", "CM7")).toBe(true);
    expect(sameChord("D", "D/F#")).toBe(false);
    expect(sameChord("Em", "Em7")).toBe(false);
  });
});
