import { describe, expect, it } from "vitest";
import { parseChordPro } from "../chordpro/parser.js";

describe("parseChordPro", () => {
  it("parses explicit start/end directives into typed sections", () => {
    const sections = parseChordPro(
      [
        "{title: Amazing Grace}",
        "{start_of_verse}",
        "[G]Amazing [C]grace how [G]sweet the sound",
        "{end_of_verse}",
        "{soc}",
        "That [D]saved a [G]wretch like me",
        "{eoc}",
      ].join("\n"),
    );

    expect(sections).toHaveLength(2);
    expect(sections[0].type).toBe("verse");
    expect(sections[1].type).toBe("chorus");
    expect(sections[0].lines).toHaveLength(1);
  });

  it("splits a lyric line into chord/lyric segments at each bracket", () => {
    const [section] = parseChordPro("{start_of_verse}\n[G]Amazing [C]grace\n{end_of_verse}");
    const segments = section.lines[0].segments;

    expect(segments).toEqual([
      expect.objectContaining({ lyric: "Amazing ", chord: expect.objectContaining({ raw: "G", normalized: null }) }),
      expect.objectContaining({ lyric: "grace", chord: expect.objectContaining({ raw: "C", normalized: null }) }),
    ]);
  });

  it("keeps chord-less leading text as its own segment", () => {
    const [section] = parseChordPro("{start_of_verse}\nHow sweet the [G]sound\n{end_of_verse}");
    const segments = section.lines[0].segments;

    expect(segments[0]).toEqual(expect.objectContaining({ lyric: "How sweet the ", chord: null }));
    expect(segments[1]).toEqual(expect.objectContaining({ lyric: "sound", chord: expect.objectContaining({ raw: "G" }) }));
  });

  it("falls back to plain-text section labels when no directives are present", () => {
    const sections = parseChordPro(
      ["Verse 1", "[G]Amazing [C]grace", "", "Chorus", "That [D]saved a [G]wretch"].join("\n"),
    );

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ type: "verse", label: "Verse 1" });
    expect(sections[1]).toMatchObject({ type: "chorus", label: "Chorus" });
  });

  it("groups untitled blank-line-separated blocks into their own 'other' sections", () => {
    const sections = parseChordPro(["[G]First block line", "", "[C]Second block line"].join("\n"));

    expect(sections).toHaveLength(2);
    expect(sections[0].type).toBe("other");
    expect(sections[1].type).toBe("other");
  });

  it("ignores non-section directives like title/key/comment", () => {
    const sections = parseChordPro(
      ["{title: Amazing Grace}", "{key: G}", "{start_of_verse}", "{comment: soft}", "[G]Amazing grace", "{end_of_verse}"].join("\n"),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].lines).toHaveLength(1);
  });

  it("produces stable, unique ids for every section/line/segment/chord", () => {
    const sections = parseChordPro("{start_of_verse}\n[G]Amazing [C]grace\n[D]how [G]sweet\n{end_of_verse}");
    const ids = new Set<string>();
    for (const section of sections) {
      ids.add(section.id);
      for (const line of section.lines) {
        ids.add(line.id);
        for (const segment of line.segments) {
          ids.add(segment.id);
          if (segment.chord) ids.add(segment.chord.id);
        }
      }
    }
    // 1 section + 2 lines + 4 segments + 4 chords = 11 unique ids
    expect(ids.size).toBe(11);
  });
});
