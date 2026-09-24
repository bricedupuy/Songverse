import { describe, expect, it } from "vitest";
import type { SetlistOfflineCopy, SetlistSongView } from "../api-client/index.js";
import { allKeptSets, findKeptSong, keepSet, keptSetDetail, keptSetSong, searchKeptSongs, type OfflineStorage } from "../offline/index.js";

function memoryStorage(): OfflineStorage {
  const sets = new Map<string, unknown>();
  return {
    get: async <T>(_: "sets", key: string) => sets.get(key) as T | undefined,
    put: async (_, key, value) => void sets.set(key, structuredClone(value)),
    keys: async () => [...sets.keys()],
  };
}

const view = (itemId: string, songId: string | null, title = "Song"): SetlistSongView =>
  ({ item: { id: itemId }, song: songId ? { id: songId, title, versionName: null } : null }) as unknown as SetlistSongView;
const copy = (id: string, songs: SetlistSongView[]): SetlistOfflineCopy =>
  ({ set: { id, name: `Set ${id}`, items: songs.map((s) => ({ id: s.item.id })) }, songs }) as unknown as SetlistOfflineCopy;

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
