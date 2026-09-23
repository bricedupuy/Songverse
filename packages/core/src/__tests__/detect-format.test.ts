import { describe, expect, it } from "vitest";
import { detectImportFormat, detectImportFormatDetails, parseSongText } from "../import-detection/detect-format.js";

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

  it("reads chord-less text as lyrics only", () => {
    expect(detectImportFormat("Just some plain lyric text\nwith no chords at all")).toBe("RAW_TEXT");
    expect(detectImportFormat("[Chorus]\nHallelujah, hallelujah")).toBe("RAW_TEXT");
  });

  it("falls back to ChordPro for empty text", () => {
    expect(detectImportFormatDetails("  \n")).toEqual({ format: "CHORDPRO", confidence: "low" });
  });

  it("is confident when the signals agree", () => {
    const text = "{start_of_verse}\n[G]Amazing [C]grace\n[G]How sweet\n{end_of_verse}";
    expect(detectImportFormatDetails(text)).toEqual({ format: "CHORDPRO", confidence: "high" });
    const lyrics = "Line one\nLine two\nLine three\nLine four";
    expect(detectImportFormatDetails(lyrics)).toEqual({ format: "RAW_TEXT", confidence: "high" });
  });

  it("is less sure when the formats are mixed", () => {
    const text = "G   C\nSome words\nD   G\nMore words\n[G]Inline here";
    expect(detectImportFormatDetails(text)).toEqual({ format: "CHORDS_OVER_LYRICS", confidence: "medium" });
    expect(detectImportFormatDetails("G C\n[G]Inline").confidence).toBe("low");
  });
});

describe("parseSongText (lyrics only)", () => {
  it("splits stanzas on blank lines and labels, keeping brackets as text", () => {
    const sections = parseSongText("Verse 1\nAmazing grace [how sweet]\nThat saved\n\nChorus:\nMy chains are gone", "RAW_TEXT");
    expect(sections.map((s) => [s.type, s.label])).toEqual([
      ["verse", "Verse 1"],
      ["chorus", "Chorus:"],
    ]);
    expect(sections[0]!.lines.map((l) => l.segments.map((seg) => [seg.lyric, seg.chord]))).toEqual([
      [["Amazing grace [how sweet]", null]],
      [["That saved", null]],
    ]);
  });

  it("uses the right parser for each format", () => {
    expect(parseSongText("[G]Hi", "CHORDPRO")[0]!.lines[0]!.segments[0]!.chord?.raw).toBe("G");
    expect(parseSongText("G\nHi", "CHORDS_OVER_LYRICS")[0]!.lines[0]!.segments[0]!.chord?.raw).toBe("G");
    expect(parseSongText("[G]Hi", "RAW_TEXT")[0]!.lines[0]!.segments[0]!.chord).toBeNull();
  });
});
