import { describe, expect, it } from "vitest";
import { formatKey, parseKey, transposeKey } from "../music-keys/transpose.js";

describe("parseKey", () => {
  it.each([
    ["G", { semitone: 7, minor: false }],
    ["Bb", { semitone: 10, minor: false }],
    ["C#m", { semitone: 1, minor: true }],
    ["F# minor", { semitone: 6, minor: true }],
    ["Ebmaj", { semitone: 3, minor: false }],
    ["a min", { semitone: 9, minor: true }],
    ["B♭", { semitone: 10, minor: false }],
    ["Cb", { semitone: 11, minor: false }],
  ])("parses %s", (text, expected) => {
    expect(parseKey(text)).toEqual(expected);
  });

  it.each(["", "H", "G7", "Gsus", "not a key"])("rejects %j", (text) => {
    expect(parseKey(text)).toBeNull();
  });
});

describe("formatKey", () => {
  it("uses flats for flat-side major keys and sharps otherwise", () => {
    expect(formatKey({ semitone: 10, minor: false })).toBe("Bb");
    expect(formatKey({ semitone: 1, minor: false })).toBe("Db");
    expect(formatKey({ semitone: 6, minor: false })).toBe("F#");
    expect(formatKey({ semitone: 11, minor: false })).toBe("B");
  });

  it("spells minor keys like their relative major", () => {
    expect(formatKey({ semitone: 2, minor: true })).toBe("Dm");
    expect(formatKey({ semitone: 7, minor: true })).toBe("Gm");
    expect(formatKey({ semitone: 10, minor: true })).toBe("Bbm");
    expect(formatKey({ semitone: 8, minor: true })).toBe("G#m");
    expect(formatKey({ semitone: 1, minor: true })).toBe("C#m");
  });
});

describe("transposeKey", () => {
  it("moves up and down, wrapping around the octave", () => {
    expect(transposeKey("G", 2)).toBe("A");
    expect(transposeKey("G", -2)).toBe("F");
    expect(transposeKey("B", 1)).toBe("C");
    expect(transposeKey("C", -1)).toBe("B");
    expect(transposeKey("Em", 3)).toBe("Gm");
    expect(transposeKey("D", 0)).toBe("D");
  });

  it("returns null for unrecognized keys", () => {
    expect(transposeKey("??", 2)).toBeNull();
  });
});
