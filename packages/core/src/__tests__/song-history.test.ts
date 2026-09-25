import { describe, expect, it } from "vitest";
import { detailChanges, diffHunks, diffLines, mergeSnapshots, snapshotChanges, songSnapshot, type SnapshotSource } from "../song-history/index.js";
import { songDocumentFromText } from "../song-document/text.js";

const verse = songDocumentFromText(null, { content: "{start_of_verse}\n[G]Amazing grace\n{end_of_verse}\n", format: "CHORDPRO", defaults: { key: "G" } });

function song(overrides: Partial<SnapshotSource> = {}, chart?: string): SnapshotSource {
  return {
    title: "Amazing Grace",
    alternateTitle: null,
    versionName: null,
    sortTitle: null,
    language: "en",
    album: null,
    year: null,
    copyright: null,
    copyrightYear: null,
    publisher: null,
    ccli: null,
    isrc: null,
    reference: null,
    notes: null,
    capo: null,
    // Edited text keeps the IDs of what's still there, as a save does.
    document: chart ? songDocumentFromText(verse, { content: chart, format: "CHORDPRO" }) : verse,
    contributors: [{ source: "John Newton", roles: ["LYRICIST"] }],
    ...overrides,
  };
}

describe("song snapshots", () => {
  it("keeps the chart without its revision, the details and the named credits", () => {
    const snapshot = songSnapshot(song({ contributors: [{ source: "John Newton", roles: ["LYRICIST"] }, { source: null, roles: ["PERFORMER"] }] }));
    expect(snapshot.$schema).toBe("song-snapshot/v1");
    expect(snapshot.chart).not.toHaveProperty("revision");
    expect(snapshot.chart.sections).toHaveLength(1);
    expect(snapshot.details.title).toBe("Amazing Grace");
    expect(snapshot.credits).toEqual([{ name: "John Newton", roles: ["LYRICIST"] }]);
  });

  it("tells the chart, the details and the credits apart", () => {
    const before = songSnapshot(song());
    expect(snapshotChanges(before, songSnapshot(song()))).toEqual([]);
    expect(snapshotChanges(before, songSnapshot(song({ title: "Grace" })))).toEqual(["details"]);
    expect(snapshotChanges(before, songSnapshot(song({ contributors: [] })))).toEqual(["credits"]);
    const edited = song({}, "{start_of_verse}\n[G]Amazing grace, how sweet\n{end_of_verse}\n");
    expect(snapshotChanges(before, songSnapshot(edited))).toEqual(["chart"]);
  });

  it("ignores key order, as jsonb stores it", () => {
    const before = songSnapshot(song());
    const reordered = JSON.parse(JSON.stringify(before, Object.keys(before).reverse()));
    const shuffled = { ...before, chart: { flow: before.chart.flow, sections: before.chart.sections.map((section) => Object.fromEntries(Object.entries(section).reverse())), defaults: before.chart.defaults } };
    expect(snapshotChanges(before, { ...reordered, ...shuffled })).toEqual([]);
  });

  it("counts the key and tempo as details", () => {
    const before = songSnapshot(song());
    const after = songSnapshot(song());
    after.chart.defaults = { ...after.chart.defaults, key: "A", tempo: 72 };
    expect(snapshotChanges(before, after)).toEqual(["details"]);
    expect(detailChanges(before, after)).toEqual([
      { field: "key", before: "G", after: "A" },
      { field: "tempo", before: "", after: "72" },
    ]);
  });
});

describe("line diffs", () => {
  it("keeps, removes and adds lines in order", () => {
    expect(diffLines(["a", "b", "c", "d"], ["a", "x", "c", "d", "e"])).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "x" },
      { kind: "same", text: "c" },
      { kind: "same", text: "d" },
      { kind: "added", text: "e" },
    ]);
    expect(diffLines([], [])).toEqual([]);
  });

  it("shows the changes with some lines around them, gaps as null", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const after = [...before];
    after[1] = "two";
    const hunks = diffHunks(diffLines(before, after), 1);
    expect(hunks).toEqual([
      { kind: "same", text: "1" },
      { kind: "removed", text: "2" },
      { kind: "added", text: "two" },
      { kind: "same", text: "3" },
      null,
    ]);
    expect(diffHunks(diffLines(before, before))).toEqual([]);
  });
});

describe("merging a suggestion", () => {
  const base = songSnapshot(song());
  const withTitle = (s: ReturnType<typeof songSnapshot>, title: string) => ({ ...s, details: { ...s.details, title } });

  it("applies what it changed, keeps what changed since", () => {
    const proposed = withTitle(base, "Grace");
    const current = { ...base, credits: [] };
    const { merged, conflicts } = mergeSnapshots(base, proposed, current);
    expect(conflicts).toEqual([]);
    expect(merged.details.title).toBe("Grace");
    expect(merged.credits).toEqual([]);
  });

  it("refuses a part changed since to something else", () => {
    const { merged, conflicts } = mergeSnapshots(base, withTitle(base, "Grace"), withTitle(base, "Amazing"));
    expect(conflicts).toEqual(["details.title"]);
    expect(merged.details.title).toBe("Amazing");
  });

  it("the same change made since isn't a conflict", () => {
    expect(mergeSnapshots(base, withTitle(base, "Grace"), withTitle(base, "Grace")).conflicts).toEqual([]);
  });

  it("the key and the chart are parts of their own", () => {
    const proposed = { ...base, chart: { ...base.chart, defaults: { ...base.chart.defaults, key: "A" } } };
    const current = songSnapshot(song({}, "{start_of_verse}\n[G]Amazing grace, how sweet\n{end_of_verse}\n"));
    const { merged, conflicts } = mergeSnapshots(base, proposed, current);
    expect(conflicts).toEqual([]);
    expect(merged.chart.defaults.key).toBe("A");
    expect(merged.chart.sections[0]!.lines[0]!.text).toBe("Amazing grace, how sweet");
  });
});
