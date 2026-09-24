import type { SetlistDetail, SetlistOfflineCopy, SetlistSongView } from "../api-client/index.js";

/**
 * What a device keeps to work offline (docs/offline.md, issues #25 and
 * #50), as plain functions over a storage interface: the web app gives it
 * IndexedDB, a mobile app (#28) its own store.
 */
export interface OfflineStorage {
  get<T>(store: "sets", key: string): Promise<T | undefined>;
  put(store: "sets", key: string, value: unknown): Promise<void>;
  keys(store: "sets"): Promise<string[]>;
}

/** A set as kept on the device: the offline copy, and when it was downloaded. */
export interface KeptSet extends SetlistOfflineCopy {
  savedAt: string;
}

/** Keeps (or refreshes) a set and its songs. */
export async function keepSet(storage: OfflineStorage, copy: SetlistOfflineCopy, now = new Date()): Promise<void> {
  const kept: KeptSet = { ...copy, savedAt: now.toISOString() };
  await storage.put("sets", copy.set.id, kept);
}

export async function keptSet(storage: OfflineStorage, setlistId: string): Promise<KeptSet | undefined> {
  return storage.get<KeptSet>("sets", setlistId);
}

/** The set as its page shows it. */
export async function keptSetDetail(storage: OfflineStorage, setlistId: string): Promise<SetlistDetail | undefined> {
  return (await keptSet(storage, setlistId))?.set;
}

/** One song of a kept set, as its song page and Live show it. */
export async function keptSetSong(storage: OfflineStorage, setlistId: string, itemId: string): Promise<SetlistSongView | undefined> {
  return (await keptSet(storage, setlistId))?.songs.find((view) => view.item.id === itemId);
}

export async function allKeptSets(storage: OfflineStorage): Promise<KeptSet[]> {
  const sets = await Promise.all((await storage.keys("sets")).map((key) => keptSet(storage, key)));
  return sets.filter((set): set is KeptSet => !!set);
}

/** A song readable offline, from any kept set: the view of its first appearance. */
export interface KeptSong {
  songVersionId: string;
  title: string;
  view: SetlistSongView;
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** The songs in kept sets whose title matches `query` (case and accents ignored), each once. */
export function searchKeptSongs(sets: KeptSet[], query: string, limit = 8): KeptSong[] {
  const q = fold(query.trim());
  const found = new Map<string, KeptSong>();
  for (const set of sets) {
    for (const view of set.songs) {
      const song = view.song;
      if (!song || found.has(song.id)) continue;
      if (!q || fold(song.title).includes(q) || (song.versionName && fold(song.versionName).includes(q))) {
        found.set(song.id, { songVersionId: song.id, title: song.title, view });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit);
}

/** A song from any kept set, by its ID: to play it on its own. */
export function findKeptSong(sets: KeptSet[], songVersionId: string): KeptSong | undefined {
  return searchKeptSongs(sets, "", Infinity).find((song) => song.songVersionId === songVersionId);
}
