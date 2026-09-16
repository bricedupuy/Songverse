import { describe, expect, it } from "vitest";
import { detectImportFormat } from "../import-detection/detect-format.js";

describe("detectImportFormat", () => {
  it("detects a ChordPro directive line", () => {
    expect(detectImportFormat("{start_of_verse}\nSome line\n{end_of_verse}")).toBe("CHORDPRO");
  });

  it("detects inline [Chord] markup mixed into a lyric line", () => {
    expect(detectImportFormat("[G]Some [C]lyric line [G]here")).toBe("CHORDPRO");
  });

  it("detects a standalone chord line followed by lyrics as chords-over-lyrics", () => {
    expect(detectImportFormat("G       C\nSome lyric line here")).toBe("CHORDS_OVER_LYRICS");
  });

  it("detects an instrumental-only chord line as chords-over-lyrics", () => {
    expect(detectImportFormat("G C G D")).toBe("CHORDS_OVER_LYRICS");
  });

  it("skips a section label before deciding", () => {
    expect(detectImportFormat("Verse 1\nG   C\nSome lyric line")).toBe("CHORDS_OVER_LYRICS");
    expect(detectImportFormat("Verse 1\n{soc}\nSome line\n{eoc}")).toBe("CHORDPRO");
  });

  it("falls back to ChordPro for plain chord-less text", () => {
    expect(detectImportFormat("Just some plain lyric text\nwith no chords at all")).toBe("CHORDPRO");
  });
});
