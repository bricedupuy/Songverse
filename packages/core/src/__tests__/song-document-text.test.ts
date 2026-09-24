import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSongDocumentV2, type SongDocumentV2 } from "../schemas/song-document-v2.js";
import { readSongDocument, sectionsFromText, sectionsToChordPro, songDocumentFromSections, songDocumentFromText, songToChordPro } from "../song-document/text.js";
import { layoutChordLine } from "../song-document/layout.js";

const read = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as unknown;

const SONG = `{start_of_verse: Verse 1}
[G]Amazing grace how [G7]sweet the [C]sound
That [G]saved a wretch like me
{end_of_verse}

{start_of_chorus}
[C]My chains are [G]gone
{end_of_chorus}
`;

const save = (previous: SongDocumentV2 | null, content: string) =>
  songDocumentFromText(previous, { content, format: "CHORDPRO" });
const ids = (doc: SongDocumentV2) => ({
  sections: doc.sections.map((s) => s.id),
  lines: doc.sections.flatMap((s) => s.lines.map((l) => l.id)),
  chords: doc.sections.flatMap((s) => s.lines.flatMap((l) => l.chords.map((c) => c.id))),
});

describe("text <-> v2", () => {
  it("parses text into lines with chords pinned to characters", () => {
    const [verse] = sectionsFromText(SONG, "CHORDPRO");
    expect(verse!.lines[0]).toMatchObject({ text: "Amazing grace how sweet the sound" });
    expect(verse!.lines[0]!.chords.map((c) => [c.raw, c.at])).toEqual([
      ["G", 0],
      ["G7", 18],
      ["C", 28],
    ]);
  });

  it("round-trips through the editor's text", () => {
    const doc = save(null, SONG);
    expect(sectionsToChordPro(doc.sections)).toBe(SONG);
  });

  it("reads label lines, and writes every section as an environment that reads back the same", () => {
    const sections = sectionsFromText("Pre-Chorus\n[Am]So I lift my [F]eyes\n\nTag\n[G]Amen\n", "CHORDPRO");
    expect(sections.map((s) => s.type)).toEqual(["pre-chorus", "tag"]);
    const text = sectionsToChordPro(sections);
    expect(text).toBe("{start_of_pre_chorus: Pre-Chorus}\n[Am]So I lift my [F]eyes\n{end_of_pre_chorus}\n\n{start_of_tag: Tag}\n[G]Amen\n{end_of_tag}\n");
    const back = sectionsFromText(text, "CHORDPRO");
    expect(back.map((s) => [s.type, s.label, s.lines.map((l) => l.text)])).toEqual(sections.map((s) => [s.type, s.label, s.lines.map((l) => l.text)]));
  });

  it("reads a comment as a note line, brackets and all, and writes it back", () => {
    const text = "{start_of_outro: Ending}\n[G]Amen\n{comment: Softly [x2]}\n{end_of_outro}\n";
    const [outro] = sectionsFromText(text, "CHORDPRO");
    expect(outro!.type).toBe("outro");
    expect(outro!.label).toBe("Ending");
    expect(outro!.lines[1]).toMatchObject({ kind: "note", text: "Softly [x2]", chords: [] });
    expect(sectionsToChordPro([outro!])).toBe(text);
  });

  it("writes a ChordPro file with the song's details from the columns", () => {
    const doc = save(null, SONG);
    doc.defaults = { key: "G", tempo: 72, timeSignature: { numerator: 3, denominator: 4 } };
    const file = songToChordPro(doc, { title: "Amazing Grace", artists: ["Chris Tomlin"], ccli: "4768151", capo: 2 });
    expect(file).toContain("{title: Amazing Grace}\n{artist: Chris Tomlin}\n{ccli: 4768151}\n{key: G}\n{tempo: 72}\n{time: 3/4}\n{capo: 2}\n\n{start_of_verse: Verse 1}");
  });
});

describe("saving text keeps IDs", () => {
  const first = save(null, SONG);

  it("starts at revision 1 and counts up", () => {
    expect(first.revision).toBe(1);
    expect(save(first, SONG).revision).toBe(2);
  });

  it("keeps every ID when nothing changed", () => {
    expect(ids(save(first, SONG))).toEqual(ids(first));
  });

  it("keeps a line's and its chords' IDs through a lyric fix and a chord move", () => {
    const edited = save(first, SONG.replace("Amazing grace how [G7]sweet", "Amazing grace, how sweet [G7]the"));
    expect(ids(edited)).toEqual(ids(first));
    expect(edited.sections[0]!.lines[0]!.chords[1]).toMatchObject({ raw: "G7", at: 25 });
  });

  it("keeps a chord's ID when its symbol changes", () => {
    const edited = save(first, SONG.replace("[C]sound", "[Cadd9]sound"));
    expect(ids(edited).chords).toEqual(ids(first).chords);
  });

  it("gives a new line a new ID without shifting the others", () => {
    const edited = save(first, SONG.replace("{start_of_verse: Verse 1}\n", "{start_of_verse: Verse 1}\n[D]A brand new first line here\n"));
    const before = ids(first).lines;
    const after = ids(edited).lines;
    expect(after).toHaveLength(before.length + 1);
    expect(after.slice(1)).toEqual(before);
    expect(before).not.toContain(after[0]);
  });

  it("keeps sections when one is inserted between them", () => {
    const edited = save(first, SONG.replace("{start_of_chorus}", "{start_of_bridge}\n[Em]Through many dangers\n{end_of_bridge}\n\n{start_of_chorus}"));
    const [verse, bridge, chorus] = edited.sections.map((s) => s.id);
    expect([verse, chorus]).toEqual(ids(first).sections);
    expect(ids(first).sections).not.toContain(bridge);
    expect(edited.flow.map((item) => item.sectionId)).toEqual([verse, bridge, chorus]);
  });

  it("keeps a flow arranged by hand, minus deleted sections, plus new ones", () => {
    const [verse, chorus] = first.sections.map((s) => s.id) as [string, string];
    const arranged = parseSongDocumentV2({
      ...first,
      flow: [
        { id: "fi_1", sectionId: verse },
        { id: "fi_2", sectionId: chorus },
        { id: "fi_3", sectionId: chorus, label: "Chorus 2", keyChange: { steps: 1, key: "Ab" } },
      ],
    });
    const withBridge = save(arranged, SONG + "\n{start_of_bridge}\n[Em]Through many dangers\n{end_of_bridge}\n");
    expect(withBridge.flow.map((item) => item.id)).toEqual(["fi_1", "fi_2", "fi_3", expect.stringMatching(/^fi_/)]);
    const withoutVerse = save(withBridge, SONG.slice(SONG.indexOf("{start_of_chorus}")));
    expect(withoutVerse.flow.map((item) => item.id)).toEqual(["fi_2", "fi_3"]);
  });

  it("keeps the defaults unless given, and the sections when content isn't", () => {
    const withKey = songDocumentFromText(first, { format: "CHORDPRO", defaults: { key: "G" } });
    expect(withKey.defaults.key).toBe("G");
    expect(ids(withKey)).toEqual(ids(first));
    expect(songDocumentFromText(withKey, { content: "", format: "CHORDPRO" }).sections).toEqual([]);
  });
});

describe("readSongDocument", () => {
  it("upgrades a stored v1 document on the fly, keeping IDs and hyphens", () => {
    const doc = readSongDocument(read("../../../db/seeds/fixtures/morning-light-song.json"));
    expect(doc.$schema).toBe("song-document/v2");
    expect(doc.sections[1]!.lines[0]!.text).toBe("Still the darkness holds its breath be-fore the dawn");
  });

  it("reads v2 as it is, and refuses anything else", () => {
    const v2 = read("./fixtures/morning-light-song.v2.json");
    expect(readSongDocument(v2)).toEqual(parseSongDocumentV2(v2));
    expect(() => readSongDocument({ $schema: "nope" })).toThrow();
  });
});

describe("layoutChordLine", () => {
  const cells = (words: ReturnType<typeof layoutChordLine>) =>
    words.map((word) => word.map((cell) => `${cell.chord ?? ""}|${cell.text}${cell.midWord ? "~" : ""}`).join(" + "));

  it("splits words at chords, marking where a word carries on", () => {
    const words = layoutChordLine("Morning light breaks", [
      { at: 0, label: "G" },
      { at: 4, label: "D/F#" },
      { at: 14, label: "Em7" },
    ]);
    expect(cells(words)).toEqual(["G|Morn~ + D/F#|ing", "| ", "|light", "| ", "Em7|breaks"]);
  });

  it("puts chords on the same character together, and one after the line on its own", () => {
    expect(cells(layoutChordLine("see", [{ at: 0, label: "Dsus4" }, { at: 0, label: "D" }, { at: 3, label: "G" }]))).toEqual([
      "Dsus4 D|see",
      "G|",
    ]);
  });

  it("gives a line of chords only one cell per chord, so it can wrap", () => {
    expect(cells(layoutChordLine("", [{ at: 0, label: "G" }, { at: 0, label: "D" }]))).toEqual(["G|", "D|"]);
  });

  it("keeps a chord over a space", () => {
    expect(cells(layoutChordLine("a  b", [{ at: 2, label: "C" }]))).toEqual(["|a", "|  + C| ", "|b"]);
  });
});

describe("songDocumentFromSections", () => {
  const first = songDocumentFromText(null, { content: SONG, format: "CHORDPRO" });
  it("takes the editor's sections as they are and moves the revision on", () => {
    const sections = structuredClone(first.sections);
    sections[0]!.lines[0]!.chords[1]!.at = 25;
    const next = songDocumentFromSections(first, { sections });
    expect(next.revision).toBe(first.revision + 1);
    expect(next.sections).toEqual(sections);
    expect(next.flow).toEqual(first.flow);
  });
  it("adds a new section to the flow and drops a deleted one", () => {
    const added = { id: "sec_new", type: "bridge" as const, showLabel: true, lines: [{ id: "line_new", kind: "lyric" as const, text: "New", chords: [] }] };
    const next = songDocumentFromSections(first, { sections: [first.sections[1]!, added] });
    expect(next.flow.map((item) => item.sectionId)).toEqual([first.sections[1]!.id, "sec_new"]);
  });
  it("refuses duplicate IDs", () => {
    const sections = structuredClone(first.sections);
    sections[1]!.lines[0]!.id = sections[0]!.lines[0]!.id;
    expect(() => songDocumentFromSections(first, { sections })).toThrow(/Duplicate id/);
  });
});
