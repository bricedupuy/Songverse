import { describe, expect, it } from "vitest";
import { newArrangementDocument, renderChart } from "../song-document/render.js";
import { arrangementFromChart, mapChartIds, remapArrangement } from "../song-document/fold.js";
import { songDocumentFromText } from "../song-document/text.js";
import { findArrangementProblems as problemsOf } from "../schemas/arrangement-document-v2.js";
import type { SongDocumentV2 } from "../schemas/song-document-v2.js";

const text = (content: string, previous: SongDocumentV2 | null = null, key = "G") =>
  songDocumentFromText(previous, { content, format: "CHORDPRO", defaults: { key } });

const CATALOGUE = `{start_of_verse: Verse 1}
[G]Amazing [G7]grace! How [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me!
{end_of_verse}

{start_of_chorus}
[C]My chains are [G]gone
{end_of_chorus}

{start_of_verse: Verse 2}
'Twas [G]grace that [G7]taught my [C]heart to [G]fear
{end_of_verse}
`;

/** What a chart reads as, pass by pass: each line's text and chords (as sung, transposed). */
function reads(chart: ReturnType<typeof renderChart>) {
  return chart.passes.map((pass) => pass.lines.map((line) => `${line.kind}:${line.text}|${line.chords.map((c) => `${c.at}${c.label}`).join(",")}`));
}

describe("mapping one chart's IDs to another's", () => {
  it("keeps the IDs a copy shares with its original", () => {
    const original = text(CATALOGUE);
    const copy = text(CATALOGUE.replace("sweet the", "sweet that"), original);
    const map = mapChartIds(copy, original);
    const line = copy.sections[0]!.lines[0]!;
    expect(map.lines.get(line.id)).toBe(line.id);
    expect(map.sections.size).toBe(3);
  });

  it("matches a song written separately by its content", () => {
    const catalogue = text(CATALOGUE);
    const separate = text(CATALOGUE);
    expect(separate.sections[0]!.id).not.toBe(catalogue.sections[0]!.id);
    const map = mapChartIds(separate, catalogue);
    expect(map.sections.get(separate.sections[1]!.id)).toBe(catalogue.sections[1]!.id);
    expect(map.lines.get(separate.sections[0]!.lines[1]!.id)).toBe(catalogue.sections[0]!.lines[1]!.id);
    expect(map.chords.get(separate.sections[0]!.lines[1]!.chords[2]!.id)).toBe(catalogue.sections[0]!.lines[1]!.chords[2]!.id);
  });
});

describe("moving an arrangement to another song", () => {
  it("points it at the other song's IDs, and asks for a review", () => {
    const catalogue = text(CATALOGUE);
    const separate = text(CATALOGUE);
    const arrangement = newArrangementDocument(separate, "copy", (() => { let n = 0; return () => `x${++n}`; })());
    const chord = separate.sections[0]!.lines[0]!.chords[1]!;
    arrangement.items[0]!.overrides = [
      { type: "chord", chordId: chord.id, raw: "G/B" },
      { type: "performance_note", lineId: separate.sections[0]!.lines[1]!.id, note: "Softly" },
    ];
    const moved = remapArrangement(arrangement, mapChartIds(separate, catalogue), "catalogue");
    expect(moved.songVersionId).toBe("catalogue");
    expect(moved.songRevision).toBe(0);
    expect(problemsOf(moved, catalogue)).toEqual([]);
    expect(renderChart(catalogue, moved).passes[0]!.lines[0]!.chords[1]!.label).toBe("G/B");
  });

  it("leaves what doesn't map, for its owner to review", () => {
    const catalogue = text(CATALOGUE);
    const separate = text(`${CATALOGUE}\n{start_of_bridge}\n[Am]Only here\n{end_of_bridge}\n`);
    const arrangement = newArrangementDocument(separate, "copy", (() => { let n = 0; return () => `y${++n}`; })());
    const moved = remapArrangement(arrangement, mapChartIds(separate, catalogue), "catalogue");
    expect(problemsOf(moved, catalogue).length).toBe(1);
  });
});

describe("an arrangement that plays one chart as another is written", () => {
  const check = (catalogue: SongDocumentV2, copy: SongDocumentV2) => {
    const arrangement = arrangementFromChart(copy, catalogue, mapChartIds(copy, catalogue), "catalogue");
    expect(arrangement).not.toBeNull();
    expect(problemsOf(arrangement!, catalogue)).toEqual([]);
    expect(reads(renderChart(catalogue, arrangement))).toEqual(reads(renderChart(copy)));
    return arrangement!;
  };

  it("none when it's sung as written", () => {
    const catalogue = text(CATALOGUE);
    const copy = text(CATALOGUE, catalogue);
    expect(arrangementFromChart(copy, catalogue, mapChartIds(copy, catalogue), "catalogue")).toBeNull();
  });

  it("changed words and chords", () => {
    const catalogue = text(CATALOGUE);
    const copy = text(CATALOGUE.replace("sweet the [G]sound", "sweet the [D]sound").replace("wretch like [D]me!", "wretch like me"), catalogue);
    const arrangement = check(catalogue, copy);
    expect(arrangement.items[0]!.overrides.map((o) => o.type).sort()).toEqual(["chord", "hide_chord", "lyric"]);
  });

  it("lines added and removed, a section left out, another order", () => {
    const catalogue = text(CATALOGUE);
    const copy = text(
      `{start_of_chorus}\n[C]My chains are [G]gone\n[D]I've been set free\n{end_of_chorus}\n\n{start_of_verse: Verse 1}\nThat [G]saved a [Em]wretch like [D]me!\n{end_of_verse}\n`,
      catalogue,
    );
    check(catalogue, copy);
  });

  it("a section the other doesn't have (its lines, under its name, end the pass before), and a whole line rewritten", () => {
    const catalogue = text(CATALOGUE);
    const copy = text(
      `${CATALOGUE.replace("That [G]saved a [Em]wretch like [D]me!", "[Am]Something [F]else [C]entirely")}\n{start_of_bridge: Bridge}\n[Am]Only [F]here\n{end_of_bridge}\n`,
      catalogue,
    );
    const arrangement = arrangementFromChart(copy, catalogue, mapChartIds(copy, catalogue), "catalogue")!;
    expect(problemsOf(arrangement, catalogue)).toEqual([]);
    const played = reads(renderChart(catalogue, arrangement));
    expect(played.length).toBe(3);
    expect(played.flat()).toEqual(reads(renderChart(copy)).flat().toSpliced(4, 0, "note:Bridge|"));
  });

  it("in another key: transposed, the chords written in the other song's key", () => {
    const catalogue = text(CATALOGUE);
    const up: Record<string, string> = { G: "A", G7: "A7", C: "D", Em: "F#m", D: "E" };
    const copy = text(CATALOGUE.replace(/\[([^\]]+)\]/g, (_, chord: string) => `[${up[chord]}]`), catalogue, "A");
    const arrangement = check(catalogue, copy);
    expect(arrangement.defaults.transposeSteps).toBe(2);
    expect(arrangement.items.every((item) => item.overrides.length === 0)).toBe(true);
  });

  it("a song written separately, matched by content", () => {
    const catalogue = text(CATALOGUE);
    const separate = text(CATALOGUE.replace("My chains are", "My chains, they're"));
    check(catalogue, separate);
  });
});
