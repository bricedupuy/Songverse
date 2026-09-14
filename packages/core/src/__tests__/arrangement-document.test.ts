import { describe, expect, it } from "vitest";
import { collectSongDocumentIds, parseSongDocument } from "../schemas/song-document.js";
import { findUnresolvedReferences, parseArrangementDocument } from "../schemas/arrangement-document.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const songFixturePath = fileURLToPath(new URL("./fixtures/morning-light-song.json", import.meta.url));
const songDoc = parseSongDocument(JSON.parse(readFileSync(songFixturePath, "utf-8")));

// Mirrors packages/db/seeds/fixtures/morning-light-arrangement.json with the
// songVersionId placeholder filled in, so the schema test stays independent
// of the seed script's runtime substitution.
const arrangementFixturePath = fileURLToPath(
  new URL("../../../db/seeds/fixtures/morning-light-arrangement.json", import.meta.url),
);
const rawArrangement = JSON.parse(readFileSync(arrangementFixturePath, "utf-8"));
rawArrangement.songVersionId = "svr_test";

describe("ArrangementDocument v1", () => {
  it("parses the Morning Light demo arrangement fixture without error", () => {
    const doc = parseArrangementDocument(rawArrangement);
    expect(doc.items).toHaveLength(10);
  });

  it("exercises all five override types across the fixture", () => {
    const doc = parseArrangementDocument(rawArrangement);
    const types = new Set(doc.items.flatMap((item) => item.overrides.map((o) => o.type)));
    expect(types).toEqual(new Set(["hide_line", "performance_note", "lyric", "chord", "insert_line"]));
  });

  it("carries exactly one mid-song key change", () => {
    const doc = parseArrangementDocument(rawArrangement);
    const keyChanges = doc.items.filter((item) => item.keyOverride != null);
    expect(keyChanges).toHaveLength(1);
    expect(keyChanges[0]?.keyOverride?.key).toBe("Bb");
  });

  it("resolves every sectionId/segmentId/lineId/chordId against the SongDocument", () => {
    const doc = parseArrangementDocument(rawArrangement);
    const currentIds = collectSongDocumentIds(songDoc);
    const unresolved = findUnresolvedReferences(doc, currentIds);
    expect(unresolved).toEqual([]);
  });

  it("flags a reference that no longer resolves after a section is removed", () => {
    const doc = parseArrangementDocument(rawArrangement);
    const currentIds = collectSongDocumentIds(songDoc);
    currentIds.sectionIds.delete("sec_bridge");
    const unresolved = findUnresolvedReferences(doc, currentIds);
    expect(unresolved.some((msg) => msg.includes("sec_bridge"))).toBe(true);
  });
});
