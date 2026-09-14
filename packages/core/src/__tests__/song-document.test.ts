import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectSongDocumentIds, parseSongDocument, safeParseSongDocument } from "../schemas/song-document.js";

const fixturePath = fileURLToPath(new URL("./fixtures/morning-light-song.json", import.meta.url));
const rawFixture = JSON.parse(readFileSync(fixturePath, "utf-8"));

describe("SongDocument v1", () => {
  it("parses the Morning Light demo fixture without error", () => {
    const doc = parseSongDocument(rawFixture);
    expect(doc.metadata.title).toBe("Morning Light");
    expect(doc.sections).toHaveLength(7);
  });

  it("never regenerates stable IDs across repeated parse/serialize round trips", () => {
    const first = parseSongDocument(rawFixture);
    const idsFirst = collectSongDocumentIds(first);

    // Simulate a save cycle: serialize to JSON and re-parse, as the API does
    // on every write. IDs must be byte-identical afterwards.
    const roundTripped = parseSongDocument(JSON.parse(JSON.stringify(first)));
    const idsSecond = collectSongDocumentIds(roundTripped);

    expect([...idsSecond.sectionIds].sort()).toEqual([...idsFirst.sectionIds].sort());
    expect([...idsSecond.lineIds].sort()).toEqual([...idsFirst.lineIds].sort());
    expect([...idsSecond.segmentIds].sort()).toEqual([...idsFirst.segmentIds].sort());
    expect([...idsSecond.chordIds].sort()).toEqual([...idsFirst.chordIds].sort());
  });

  it("collects the expected counts from the fixture (7 sections, 24 lines, 99 segments, 64 chords)", () => {
    const doc = parseSongDocument(rawFixture);
    const ids = collectSongDocumentIds(doc);
    expect(ids.sectionIds.size).toBe(7);
    expect(ids.lineIds.size).toBe(24);
    expect(ids.segmentIds.size).toBe(99);
    expect(ids.chordIds.size).toBe(64);
  });

  it("rejects a document with the wrong schema tag", () => {
    const bad = { ...rawFixture, $schema: "song-document/v2" };
    const result = safeParseSongDocument(bad);
    expect(result.success).toBe(false);
  });
});
