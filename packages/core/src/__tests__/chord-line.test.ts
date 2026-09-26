import { describe, expect, it } from "vitest";
import { chordLineFromText, chordLineToText } from "../song-document/chord-line.js";

describe("chord lines in brackets", () => {
  it("reads words and chords, and writes them back", () => {
    let n = 0;
    const line = chordLineFromText("[G]Sing it a[D/F#]gain[C]", [], () => `c${++n}`);
    expect(line).toEqual({
      text: "Sing it again",
      chords: [
        { id: "c1", at: 0, raw: "G" },
        { id: "c2", at: 9, raw: "D/F#" },
        { id: "c3", at: 13, raw: "C" },
      ],
    });
    expect(chordLineToText(line)).toBe("[G]Sing it a[D/F#]gain[C]");
  });

  it("keeps the chords' IDs in order, and skips empty brackets", () => {
    const line = chordLineFromText("[A]Oh [][E]yes", [{ id: "keep1" }], () => "new");
    expect(line.chords.map((chord) => chord.id)).toEqual(["keep1", "new"]);
    expect(line.text).toBe("Oh yes");
  });

  it("writes chords on the same character one after the other", () => {
    expect(chordLineToText({ text: "Hi", chords: [{ at: 0, raw: "G" }, { at: 0, raw: "D" }] })).toBe("[G][D]Hi");
  });
});
