import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseArrangementDocument } from "../schemas/arrangement-document.js";
import {
  ChartPreferencesSchema,
  findArrangementProblems,
  parseArrangementDocumentV2,
  placeChords,
  type ArrangementDocumentV2,
} from "../schemas/arrangement-document-v2.js";
import { parseSongDocument } from "../schemas/song-document.js";
import { arrangementDocumentV1ToV2, songDocumentV1ToV2 } from "../schemas/song-document-v1-to-v2.js";
import { collectSongDocumentIds } from "../schemas/song-document.js";
import { collectSongDocumentV2Ids, parseSongDocumentV2, safeParseSongDocumentV2, type SongDocumentV2 } from "../schemas/song-document-v2.js";

const read = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as unknown;
const songV1 = parseSongDocument(read("../../../db/seeds/fixtures/morning-light-song.json"));
const arrangementV1 = parseArrangementDocument(read("../../../db/seeds/fixtures/morning-light-arrangement.json"));
const songV2 = parseSongDocumentV2(read("./fixtures/morning-light-song.v2.json"));
const arrangementV2 = parseArrangementDocumentV2(read("./fixtures/morning-light-arrangement.v2.json"));

const minimal = (lines: unknown[], extra: Record<string, unknown> = {}) => ({
  $schema: "song-document/v2",
  revision: 1,
  defaults: {},
  sections: [{ id: "sec_a", type: "verse", lines }],
  flow: [{ id: "fi_a", sectionId: "sec_a" }],
  ...extra,
});
const line = (text: string, chords: { id: string; at: number; raw: string }[], extra: Record<string, unknown> = {}) => ({
  id: "line_a",
  text,
  chords,
  ...extra,
});
const errors = (input: unknown) => {
  const result = safeParseSongDocumentV2(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("SongDocument v2", () => {
  it("reads the Morning Light example, with defaults filled in", () => {
    expect(songV2.sections).toHaveLength(7);
    expect(songV2.flow.map((item) => item.sectionId)).toEqual(songV2.sections.map((section) => section.id));
    const parsed = parseSongDocumentV2(minimal([{ id: "line_a", text: "Hi" }]));
    expect(parsed.sections[0]!.showLabel).toBe(true);
    expect(parsed.sections[0]!.lines[0]).toMatchObject({ kind: "lyric", chords: [] });
  });

  it("pins chords to characters, in order, within the line", () => {
    expect(errors(minimal([line("Amazing grace", [{ id: "c1", at: 0, raw: "G" }, { id: "c2", at: 13, raw: "C" }])]))).toEqual([]);
    expect(errors(minimal([line("Hi", [{ id: "c1", at: 3, raw: "G" }])]))).toContain("The chord is past the end of the line");
    expect(errors(minimal([line("Amazing", [{ id: "c1", at: 4, raw: "G" }, { id: "c2", at: 1, raw: "C" }])]))).toContain(
      "Chords must be in order along the line",
    );
  });

  it("never lets a chord split a character", () => {
    const combining = "Café au lait"; // "é" written as e + combining accent
    expect(errors(minimal([line(combining, [{ id: "c1", at: 4, raw: "G" }])]))).toContain("The chord splits a character");
    expect(errors(minimal([line(combining, [{ id: "c1", at: 3, raw: "G" }])]))).toEqual([]);
    const emoji = "Joy 🎉 now";
    expect(errors(minimal([line(emoji, [{ id: "c1", at: 5, raw: "G" }])]))).toContain("The chord splits a character");
    expect(errors(minimal([line(emoji, [{ id: "c1", at: 6, raw: "G" }])]))).toEqual([]);
  });

  it("keeps chords off note lines", () => {
    expect(errors(minimal([line("×2", [{ id: "c1", at: 0, raw: "G" }], { kind: "note" })]))).toContain("A note line has no chords");
    expect(errors(minimal([line("×2", [], { kind: "note" })]))).toEqual([]);
  });

  it("checks IDs are unique and references resolve", () => {
    expect(errors(minimal([line("A", [{ id: "line_a", at: 0, raw: "G" }])]))).toContain("Duplicate id line_a");
    expect(errors(minimal([line("A", [])], { flow: [{ id: "fi_a", sectionId: "sec_missing" }] }))).toContain("No section sec_missing");
    const withRhythm = minimal([line("A", [{ id: "c1", at: 0, raw: "G" }])]);
    (withRhythm.sections[0] as Record<string, unknown>).rhythm = { bars: [{ chords: [{ chordId: "c9", beat: 1 }] }] };
    expect(errors(withRhythm)).toContain("No chord c9");
  });

  it("allows the same section several times in the flow", () => {
    const doc = minimal([line("A", [])], {
      flow: [
        { id: "fi_1", sectionId: "sec_a" },
        { id: "fi_2", sectionId: "sec_a", label: "Chorus 2", keyChange: { steps: 1, key: "Ab" } },
      ],
    });
    expect(errors(doc)).toEqual([]);
    expect(errors({ ...doc, flow: [{ id: "fi_1", sectionId: "sec_a", keyChange: { steps: 0, key: "G" } }] })).toContain(
      "A key change changes the key",
    );
  });
});

describe("v1 -> v2", () => {
  it("converts Morning Light to the v2 example", () => {
    const { document, warnings, capo } = songDocumentV1ToV2(songV1, { stripSyllableHyphens: true });
    expect(document).toEqual(songV2);
    expect(warnings).toEqual([]);
    expect(capo).toBeNull();
  });

  it("keeps every section, line and chord ID", () => {
    const before = collectSongDocumentIds(songV1);
    const after = collectSongDocumentV2Ids(songV2);
    expect([...after.sectionIds]).toEqual([...before.sectionIds]);
    expect([...after.lineIds.keys()]).toEqual([...before.lineIds]);
    expect([...after.chordIds]).toEqual([...before.chordIds]);
  });

  it("joins a line into one text, chords on the character their segment started at", () => {
    const first = songV2.sections[1]!.lines[0]!;
    expect(first.text).toBe("Still the darkness holds its breath before the dawn");
    expect(first.chords.map((chord) => `${chord.raw}:${first.text.slice(chord.at, chord.at + 6)}`)).toEqual([
      "G:Still ",
      "D/F#:breath",
      "Em7:dawn",
    ]);
    const endChord = songV2.sections[2]!.lines[1]!;
    expect(endChord.chords.at(-1)).toMatchObject({ raw: "D", at: endChord.text.length });
  });

  it("keeps hyphens unless asked to remove syllable breaks", () => {
    const kept = songDocumentV1ToV2(songV1).document.sections[1]!.lines[0]!;
    expect(kept.text).toBe("Still the darkness holds its breath be-fore the dawn");
  });

  it("points rhythm maps at chords and characters", () => {
    const bar = songV2.sections[1]!.rhythm!.bars[1]!;
    expect(bar.chords).toEqual([{ chordId: "chd_v1_02", beat: 1 }]);
    expect(bar.lyricAnchor).toEqual({ lineId: "line_v1_01", at: 29 });
  });

  it("converts the Morning Light arrangement to the v2 example", () => {
    const { document, warnings } = arrangementDocumentV1ToV2(arrangementV1, songV1, { stripSyllableHyphens: true });
    expect(document).toEqual(arrangementV2);
    // v1's final-chorus override (D -> "F" while playing a minor third up) is D itself in the song's key.
    expect(warnings).toEqual([expect.objectContaining({ message: expect.stringContaining("chd_ch_02 -> F is the song's own D") })]);
    expect(findArrangementProblems(document, songV2)).toEqual([]);
  });

  it("turns a segment lyric change into a line change that keeps the chords", () => {
    const bridge = arrangementV2.items.find((item) => item.id === "ai_08")!;
    expect(bridge.overrides).toEqual([
      {
        type: "lyric",
        lineId: "line_br_04",
        text: "And I will sing until all the world believes",
        chordPositions: { chd_br_09: 22, chd_br_10: 30 },
      },
    ]);
    const line = songV2.sections.flatMap((section) => section.lines).find((l) => l.id === "line_br_04")!;
    const placed = placeChords(line.chords, bridge.overrides[0]!.type === "lyric" ? bridge.overrides[0]!.text : "", { chd_br_09: 22, chd_br_10: 30 });
    expect(placed.map((chord) => chord.at)).toEqual([0, 22, 30]);
  });

  it("writes a chord override back in the song's key", () => {
    const v1 = structuredClone(arrangementV1);
    const final = v1.items.find((item) => item.id === "ai_09")!;
    final.overrides[0] = { type: "chord", chordId: "chd_ch_02", raw: "Ab", normalized: null };
    const { document, warnings } = arrangementDocumentV1ToV2(v1, songV1, { stripSyllableHyphens: true });
    expect(document.items.find((item) => item.id === "ai_09")!.overrides[0]).toEqual({ type: "chord", chordId: "chd_ch_02", raw: "F" });
    expect(warnings[0]!.message).toContain("now F");
  });
});

describe("arrangements against a changed song", () => {
  it("reports references that no longer resolve", () => {
    const edited: SongDocumentV2 = structuredClone(songV2);
    const chorus = edited.sections.find((section) => section.id === "sec_chorus")!;
    chorus.lines = chorus.lines.filter((l) => l.id !== "line_ch_01");
    const arrangement: ArrangementDocumentV2 = structuredClone(arrangementV2);
    arrangement.items[0]!.overrides.push({ type: "hide_chord", chordId: "chd_nope" });
    expect(findArrangementProblems(arrangement, edited)).toEqual([
      "item ai_01: chord chd_nope not found",
      "item ai_07: line line_ch_01 not found",
    ]);
  });

  it("lets an arrangement hide a chord it inserted", () => {
    const arrangement: ArrangementDocumentV2 = structuredClone(arrangementV2);
    arrangement.items.find((item) => item.id === "ai_09")!.overrides.push({ type: "hide_chord", chordId: "ins_chd_01" });
    expect(findArrangementProblems(arrangement, songV2)).toEqual([]);
  });
});

describe("chart preferences", () => {
  it("defaults to showing everything", () => {
    expect(ChartPreferencesSchema.parse({ $schema: "chart-preferences/v1" })).toEqual({
      $schema: "chart-preferences/v1",
      hiddenChordIds: [],
      simplifyChords: false,
      hideBassNotes: false,
    });
  });
});
