import { describe, expect, it } from "vitest";
import { parseChordPro } from "../chordpro/parser.js";
import { serializeChordPro } from "../chordpro/serializer.js";
import { parseSongDocument } from "../schemas/song-document.js";

function doc(sections: ReturnType<typeof parseChordPro>, overrides: Partial<Parameters<typeof parseSongDocument>[0]> = {}) {
  return parseSongDocument({
    $schema: "song-document/v1",
    metadata: { title: "Amazing Grace", language: "en" },
    defaults: {},
    sections,
    ...overrides,
  });
}

describe("serializeChordPro", () => {
  it("emits title/key/tempo/ccli directives before the sections", () => {
    const sections = parseChordPro("{start_of_verse}\n[G]Amazing grace\n{end_of_verse}");
    const output = serializeChordPro(
      doc(sections, {
        metadata: { title: "Amazing Grace", language: "en", ccli: "18723" },
        defaults: { key: "G", tempo: 72 },
      }),
    );

    expect(output).toContain("{title: Amazing Grace}");
    expect(output).toContain("{ccli: 18723}");
    expect(output).toContain("{key: G}");
    expect(output).toContain("{tempo: 72}");
  });

  it("round-trips through parse -> serialize -> parse with the same structure", () => {
    const original = "{start_of_verse}\n[G]Amazing [C]grace how [G]sweet the sound\n{end_of_verse}\n{soc}\nThat [D]saved a [G]wretch\n{eoc}";
    const firstPass = parseChordPro(original);
    const serialized = serializeChordPro(doc(firstPass));
    const secondPass = parseChordPro(serialized);

    expect(secondPass.map((s) => s.type)).toEqual(firstPass.map((s) => s.type));
    expect(secondPass.map((s) => s.lines.map((l) => l.segments.map((seg) => seg.lyric).join("")))).toEqual(
      firstPass.map((s) => s.lines.map((l) => l.segments.map((seg) => seg.lyric).join(""))),
    );
    expect(secondPass.flatMap((s) => s.lines.flatMap((l) => l.segments.map((seg) => seg.chord?.raw ?? null)))).toEqual(
      firstPass.flatMap((s) => s.lines.flatMap((l) => l.segments.map((seg) => seg.chord?.raw ?? null))),
    );
  });

  it("falls back to a plain title-case label for section types with no ChordPro directive", () => {
    const sections = parseChordPro("Intro\n[G]oOoOoh");
    const output = serializeChordPro(doc(sections));
    expect(output).toContain("Intro");
  });

  it("uses the section's explicit label over the type-based fallback when both would render a directive", () => {
    const sections = parseChordPro("{start_of_chorus: Big Chorus}\n[G]Amazing\n{end_of_chorus}");
    const output = serializeChordPro(doc(sections));
    expect(output).toContain("{start_of_chorus: Big Chorus}");
  });
});
