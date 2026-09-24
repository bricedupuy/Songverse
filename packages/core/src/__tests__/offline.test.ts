import { describe, expect, it } from "vitest";
import type { SetlistOfflineCopy, SetlistSongView } from "../api-client/index.js";
import type { OfflineSyncResponse } from "../api-client/index.js";
import { allKeptSets, findKeptSong, keepSet, keptSetDetail, keptSetSong, lastOfflineSync, searchKeptSongs, syncKeptSets, type OfflineStorage } from "../offline/index.js";

function memoryStorage(): OfflineStorage {
  const stores = { sets: new Map<string, unknown>(), meta: new Map<string, unknown>() };
  return {
    get: async <T>(store: "sets" | "meta", key: string) => stores[store].get(key) as T | undefined,
    put: async (store, key, value) => void stores[store].set(key, structuredClone(value)),
    delete: async (store, key) => void stores[store].delete(key),
    keys: async (store) => [...stores[store].keys()],
  };
}

const view = (itemId: string, songId: string | null, title = "Song"): SetlistSongView =>
  ({ item: { id: itemId }, song: songId ? { id: songId, title, versionName: null } : null }) as unknown as SetlistSongView;
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
    const sets = await allKeptSets(storage);
    expect(searchKeptSongs(sets, "elev").map((s) => s.songVersionId)).toEqual(["v1"]);
    expect(searchKeptSongs(sets, "").map((s) => s.title)).toEqual(["Élévation", "Other"]);
    expect(findKeptSong(sets, "v4")?.view.item.id).toBe("i4");
    expect(findKeptSong(sets, "missing")).toBeUndefined();
  });
});

describe("syncing kept sets", () => {
  const now = new Date("2026-09-25T10:00:00Z");

  it("sends the kept versions; stores what changed or is new, removes what's gone", async () => {
    const storage = memoryStorage();
    await keepSet(storage, copy("same", [view("i1", "v1")], "2026-09-27", "a"));
    await keepSet(storage, copy("changed", [view("i2", "v2", "Old")], "2026-09-28", "a"));
    await keepSet(storage, copy("deleted", [view("i3", "v3")], "2026-09-29", "a"));
    let sent: { id: string; version: string }[] = [];
    const response: OfflineSyncResponse = {
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

  it("drops a set a day after its date; undated sets stay", async () => {
    const storage = memoryStorage();
    await keepSet(storage, copy("yesterday", [], "2026-09-24"));
    await keepSet(storage, copy("old", [], "2026-09-23"));
    await keepSet(storage, copy("undated", []));
    await syncKeptSets(storage, async () => ({ days: 14, upcoming: [], sets: [], gone: [] }), now);
    expect((await allKeptSets(storage)).map((k) => k.set.id).sort()).toEqual(["undated", "yesterday"]);
  });
});
