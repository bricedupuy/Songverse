import { describe, expect, it } from "vitest";
import type { SetlistOfflineCopy, SetlistSongView } from "../api-client/index.js";
import type { OfflineSyncResponse } from "../api-client/index.js";
import {
  allKeptSets,
  findKeptSong,
  keepSet,
  keptSetDetail,
  keptSetSong,
  keptSongbook,
  keptSongReferences,
  keptSongCopy,
  lastOfflineSync,
  offlineViewer,
  searchKeptEntries,
  searchKeptSongs,
  syncKeptFiles,
  offlineFingerprint,
  syncKeptSets,
  wantedFiles,
  type OfflineStorage,
  type OfflineStoreKey,
} from "../offline/index.js";

function memoryStorage(): OfflineStorage {
  const stores: Record<OfflineStoreKey, Map<string, unknown>> = { sets: new Map(), songs: new Map(), songbooks: new Map(), files: new Map(), meta: new Map() };
  return {
    get: async <T>(store: OfflineStoreKey, key: string) => stores[store].get(key) as T | undefined,
    put: async (store, key, value) => void stores[store].set(key, structuredClone(value)),
    delete: async (store, key) => void stores[store].delete(key),
    keys: async (store) => [...stores[store].keys()],
  };
}

const view = (itemId: string, songId: string | null, title = "Song"): SetlistSongView =>
  ({ item: { id: itemId }, song: songId ? { id: songId, title, versionName: null, document: { sections: [] }, suggestedCapo: null } : null }) as unknown as SetlistSongView;
const copy = (id: string, songs: SetlistSongView[], eventDate: string | null = null, version = "v1"): SetlistOfflineCopy =>
  ({ set: { id, name: `Set ${id}`, eventDate, items: songs.map((s) => ({ id: s.item.id })) }, songs, version }) as unknown as SetlistOfflineCopy;

describe("offline sets", () => {
  it("keeps a set and reads it, and each song, back", async () => {
    const storage = memoryStorage();
    await keepSet(storage, copy("s1", [view("i1", "v1", "Amazing Grace"), view("i2", "v2")]), new Date("2026-09-25T10:00:00Z"));
    expect((await keptSetDetail(storage, "s1"))?.name).toBe("Set s1");
    expect((await keptSetSong(storage, "s1", "i2"))?.song?.id).toBe("v2");
    expect(await keptSetSong(storage, "s1", "nope")).toBeUndefined();
    expect(await keptSetDetail(storage, "s2")).toBeUndefined();
    expect((await allKeptSets(storage))[0]?.savedAt).toBe("2026-09-25T10:00:00.000Z");
  });

  it("refreshing a set replaces it", async () => {
    const storage = memoryStorage();
    await keepSet(storage, copy("s1", [view("i1", "v1")]));
    await keepSet(storage, copy("s1", [view("i3", "v3")]));
    expect(await keptSetSong(storage, "s1", "i1")).toBeUndefined();
    expect(await keptSetSong(storage, "s1", "i3")).toBeDefined();
  });

  it("finds songs across kept sets, each once, ignoring accents; never a hidden one", async () => {
    const storage = memoryStorage();
    await keepSet(storage, copy("s1", [view("i1", "v1", "Élévation"), view("i2", null)]));
    await keepSet(storage, copy("s2", [view("i3", "v1", "Élévation"), view("i4", "v4", "Other")]));
    expect((await searchKeptSongs(storage, "elev")).map((s) => s.songVersionId)).toEqual(["v1"]);
    expect((await searchKeptSongs(storage, "")).map((s) => s.title)).toEqual(["Élévation", "Other"]);
    expect((await findKeptSong(storage, "v4"))?.title).toBe("Other");
    expect(await findKeptSong(storage, "missing")).toBeUndefined();
  });
});

describe("syncing kept sets", () => {
  const now = new Date("2026-09-25T10:00:00Z");

  const empty = { songbooks: [], goneSongbooks: [], songs: [], goneSongs: [], pins: [], viewer: { chordNotation: "LETTERS" as const, capoDisplayMode: "SOUNDING" as const } };

  it("sends the kept versions; stores what changed or is new, removes what's gone", async () => {
    const storage = memoryStorage();
    await keepSet(storage, copy("same", [view("i1", "v1")], "2026-09-27", "a"));
    await keepSet(storage, copy("changed", [view("i2", "v2", "Old")], "2026-09-28", "a"));
    await keepSet(storage, copy("deleted", [view("i3", "v3")], "2026-09-29", "a"));
    let sent: { id: string; version: string }[] = [];
    const response: OfflineSyncResponse = {
      ...empty,
      days: 14,
      upcoming: ["same", "changed", "new"],
      sets: [
        { id: "same", version: "a" },
        { id: "changed", version: "b", copy: copy("changed", [view("i2", "v2", "New")], "2026-09-28", "b") },
        { id: "new", version: "a", copy: copy("new", [view("i4", "v4")], "2026-10-01", "a") },
      ],
      gone: ["deleted"],
    };
    const result = await syncKeptSets(storage, async (known) => ((sent = known), response), now);
    expect(sent.map((k) => `${k.id}:${k.version}`).sort()).toEqual(["changed:a", "deleted:a", "same:a"]);
    expect((await allKeptSets(storage)).map((k) => k.set.id).sort()).toEqual(["changed", "new", "same"]);
    expect((await keptSetSong(storage, "changed", "i2"))?.song?.title).toBe("New");
    expect(result).toMatchObject({ updated: 2, removed: 1, kept: 3 });
    expect((await lastOfflineSync(storage))?.at).toBe(now.toISOString());
  });

  it("asks first whether anything changed (issue #121): an up-to-date device never sends its lists", async () => {
    const storage = memoryStorage();
    await keepSet(storage, copy("s1", [view("i1", "v1")], "2026-09-27", "a"));
    const expected = await offlineFingerprint({ sets: [{ id: "s1", version: "a" }], songs: [], songbooks: [] });
    let fullSyncs = 0;
    let checked: { fingerprint: string; known: { id: string; version: string }[] } | null = null;
    const full = async (): Promise<OfflineSyncResponse> => (fullSyncs++, { ...empty, days: 14, upcoming: [], sets: [{ id: "s1", version: "a" }], gone: [] });
    const viewer = { chordNotation: "SOLFEGE" as const, capoDisplayMode: "SOUNDING" as const };
    const result = await syncKeptSets(storage, full, now, { check: async (fingerprint, known) => ((checked = { fingerprint, known }), { unchanged: true, days: 14, upcoming: [], pins: [], viewer }) });
    expect(checked).toEqual({ fingerprint: expected, known: [{ id: "s1", version: "a" }] });
    expect(fullSyncs).toBe(0);
    expect(result).toMatchObject({ updated: 0, removed: 0, kept: 1 });
    expect(await storage.get("meta", "viewer")).toEqual(viewer);
    // Out of date: the full sync, as before.
    await syncKeptSets(storage, full, now, { check: async () => ({ unchanged: false }) });
    expect(fullSyncs).toBe(1);
  });

  it("a fingerprint depends on what's kept, not the order it's listed in", async () => {
    const a = { sets: [{ id: "s1", version: "a" }, { id: "s2", version: "b" }], songs: [{ id: "v1", version: "1", audio: false }], songbooks: [] };
    const b = { ...a, sets: [...a.sets].reverse() };
    expect(await offlineFingerprint(a)).toBe(await offlineFingerprint(b));
    expect(await offlineFingerprint(a)).not.toBe(await offlineFingerprint({ ...a, songs: [{ id: "v1", version: "1", audio: true }] }));
  });

  it("drops a set a day after its date; undated sets stay", async () => {
    const storage = memoryStorage();
    await keepSet(storage, copy("yesterday", [], "2026-09-24"));
    await keepSet(storage, copy("old", [], "2026-09-23"));
    await keepSet(storage, copy("undated", []));
    await syncKeptSets(storage, async () => ({ ...empty, days: 14, upcoming: [], sets: [], gone: [] }), now);
    expect((await allKeptSets(storage)).map((k) => k.set.id).sort()).toEqual(["undated", "yesterday"]);
  });
});

describe("songs, songbooks and files kept offline", () => {
  const file = (id: string, type = "PDF") => ({ id, type, songVersionId: "v1", filename: `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 3, createdAt: "" });
  const songCopy = (id: string, title: string, attachments: ReturnType<typeof file>[] = [], artist = "John Newton") =>
    ({ song: { id, title, versionName: null, artists: [{ source: artist, userId: null }], documentJson: { sections: [] }, capo: 2 }, attachments, version: "1" }) as never;
  const base = { days: 14, upcoming: [], sets: [], gone: [], pins: [], viewer: { chordNotation: "SOLFEGE" as const, capoDisplayMode: "FINGERED" as const } };

  it("songs the answer had no room for are fetched a hundred at a time (issue #122)", async () => {
    const storage = memoryStorage();
    const ids = Array.from({ length: 230 }, (_, i) => `v${i}`);
    const asked: string[][] = [];
    await syncKeptSets(
      storage,
      async () => ({ ...base, songbooks: [], goneSongbooks: [], goneSongs: [], songs: ids.map((id) => ({ id, version: "1", audio: id === "v200", pending: true as const })) }),
      new Date(),
      { fetchSongs: async (batch) => (asked.push(batch), batch.map((id) => songCopy(id, `Song ${id}`, []))) },
    );
    expect(asked.map((batch) => batch.length)).toEqual([100, 100, 30]);
    expect((await keptSongCopy(storage, "v229"))?.song.title).toBe("Song v229");
    expect((await keptSongCopy(storage, "v200"))?.audio).toBe(true);
  });

  it("keeps songs and songbooks, finds songs by artist, removes the gone ones, keeps the viewer's settings", async () => {
    const storage = memoryStorage();
    let sent: unknown[] = [];
    await syncKeptSets(storage, async (...known) => ((sent = known), {
      ...base,
      songbooks: [{ id: "b1", version: "1", copy: { songbook: { id: "b1", name: "Hymns", entries: [] }, version: "1" } as never }],
      goneSongbooks: [],
      songs: [
        { id: "v1", version: "1", audio: false, copy: songCopy("v1", "Amazing Grace") },
        { id: "v2", version: "1", audio: false, copy: songCopy("v2", "Other", [], "Someone else") },
      ],
      goneSongs: [],
    }));
    expect(sent).toEqual([[], [], []]);
    expect((await keptSongbook(storage, "b1"))?.name).toBe("Hymns");
    expect((await searchKeptSongs(storage, "newton")).map((s) => s.songVersionId)).toEqual(["v1"]);
    expect((await findKeptSong(storage, "v1"))?.capo).toBe(2);
    expect((await offlineViewer(storage))?.chordNotation).toBe("SOLFEGE");

    await syncKeptSets(storage, async (...known) => ((sent = known), { ...base, songbooks: [], goneSongbooks: ["b1"], songs: [{ id: "v1", version: "1", audio: false }], goneSongs: ["v2"] }));
    expect(sent[1]).toEqual([{ id: "v1", version: "1" }, { id: "v2", version: "1" }]);
    expect(await keptSongbook(storage, "b1")).toBeUndefined();
    expect(await keptSongCopy(storage, "v2")).toBeUndefined();
    expect((await keptSongCopy(storage, "v1"))?.song.title).toBe("Amazing Grace");
  });

  it("files: a kept song's, audio only when asked for; unwanted ones go", async () => {
    const storage = memoryStorage();
    const files = [file("pdf"), file("mp3", "AUDIO")];
    await syncKeptSets(storage, async () => ({ ...base, songbooks: [], goneSongbooks: [], songs: [{ id: "v1", version: "1", audio: false, copy: songCopy("v1", "Song", files) }], goneSongs: [] }));
    expect((await wantedFiles(storage)).map((f) => f.attachment.id)).toEqual(["pdf"]);
    const downloads: string[] = [];
    expect(await syncKeptFiles(storage, async (f) => (downloads.push(f.attachment.id), "bytes"))).toEqual({ downloaded: 1, removed: 0 });
    // Audio asked for later: same version, the flag changes.
    await syncKeptSets(storage, async () => ({ ...base, songbooks: [], goneSongbooks: [], songs: [{ id: "v1", version: "1", audio: true }], goneSongs: [] }));
    await syncKeptFiles(storage, async (f) => (downloads.push(f.attachment.id), "bytes"));
    expect(downloads).toEqual(["pdf", "mp3"]);
    // The song goes: its files go too.
    await syncKeptSets(storage, async () => ({ ...base, songbooks: [], goneSongbooks: [], songs: [], goneSongs: ["v1"] }));
    expect(await syncKeptFiles(storage, async () => "bytes")).toEqual({ downloaded: 0, removed: 2 });
  });
});

describe("songbook references offline", () => {
  it("finds entries of kept songbooks by reference", async () => {
    const storage = memoryStorage();
    const book = (id: string, name: string, abbreviation: string | null, entries: [string, string, string][]) =>
      storage.put("songbooks", id, {
        songbook: { id, name, abbreviation, entries: entries.map(([entryCode, songVersionId, songVersionTitle]) => ({ id: `${id}-${entryCode}`, entryCode, songVersionId, songVersionTitle })) },
        version: "1",
        savedAt: "",
      });
    await book("hy", "Hymns", "HY", [["42", "v1", "Amazing Grace"], ["43", "v2", "Other"]]);
    await book("cv", "Chants de victoire", "CV", [["42", "v3", "Chant 42"]]);
    expect((await searchKeptEntries(storage, "HY 42")).map((hit) => hit.title)).toEqual(["Amazing Grace"]);
    expect((await searchKeptEntries(storage, "hy42")).map((hit) => hit.title)).toEqual(["Amazing Grace"]);
    expect((await searchKeptEntries(storage, "victoire 42")).map((hit) => hit.songVersionId)).toEqual(["v3"]);
    expect((await searchKeptEntries(storage, "42")).map((hit) => hit.songbookName)).toEqual(["Chants de victoire", "Hymns"]);
    expect(await searchKeptEntries(storage, "grace")).toEqual([]);
  });
});

describe("a kept song's references", () => {
  it("from kept songbooks and sets, each once", async () => {
    const storage = memoryStorage();
    await storage.put("songbooks", "jem", {
      songbook: { id: "jem", name: "J'aime l'Éternel", abbreviation: "JEM", entries: [{ id: "e1", entryCode: "855", songVersionId: "v1", songVersionTitle: "Song", sectionLabel: "JEM3" }] },
      version: "1",
      savedAt: "",
    });
    await keepSet(storage, copy("s1", [{ ...view("i1", "v1"), songbookReferences: ["JEM 855 · JEM3", "HY 42"] } as never]));
    expect(await keptSongReferences(storage, "v1")).toEqual(["HY 42", "JEM 855 · JEM3"]);
    expect(await keptSongReferences(storage, "v2")).toEqual([]);
  });
});
