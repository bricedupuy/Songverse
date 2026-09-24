import type { OfflineSyncResponse, SetlistDetail, SetlistOfflineCopy, SetlistSongView } from "../api-client/index.js";

/**
 * What a device keeps to work offline (docs/offline.md, issues #25 and
 * #50), as plain functions over a storage interface: the web app gives it
 * IndexedDB, a mobile app (#28) its own store.
 */
export type OfflineStoreKey = "sets" | "meta";
export interface OfflineStorage {
  get<T>(store: OfflineStoreKey, key: string): Promise<T | undefined>;
  put(store: OfflineStoreKey, key: string, value: unknown): Promise<void>;
  delete(store: OfflineStoreKey, key: string): Promise<void>;
  keys(store: OfflineStoreKey): Promise<string[]>;
}

/** A set as kept on the device: the offline copy (with its version), and when it was downloaded. */
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a sync did, and when it last ran. */
export interface OfflineSyncResult {
  at: string;
  updated: number;
  removed: number;
  kept: number;
}

/**
 * Brings the device's copy up to date (issue #51): sends the versions of the
 * sets it keeps, stores the copies that changed or are newly upcoming,
 * removes the sets that are gone (deleted, access lost), and drops sets a
 * day after their date. `send` is POST /offline/sync.
 */
export async function syncKeptSets(
  storage: OfflineStorage,
  send: (known: { id: string; version: string }[]) => Promise<OfflineSyncResponse>,
  now = new Date(),
): Promise<OfflineSyncResult> {
  const before = await allKeptSets(storage);
  const response = await send(before.map((kept) => ({ id: kept.set.id, version: kept.version ?? "" })));
  let updated = 0;
  let removed = 0;
  for (const id of response.gone) {
    await storage.delete("sets", id);
    removed++;
  }
  for (const entry of response.sets) {
    if (!entry.copy) continue;
    await keepSet(storage, entry.copy, now);
    updated++;
  }
  // A set drops off the device a day after its date.
  const yesterday = new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
  const after = await allKeptSets(storage);
  for (const kept of after) {
    if (kept.set.eventDate && kept.set.eventDate < yesterday) {
      await storage.delete("sets", kept.set.id);
      removed++;
    }
  }
  const result: OfflineSyncResult = { at: now.toISOString(), updated, removed, kept: (await storage.keys("sets")).length };
  await storage.put("meta", "lastSync", result);
  return result;
}

export async function lastOfflineSync(storage: OfflineStorage): Promise<OfflineSyncResult | undefined> {
  return storage.get<OfflineSyncResult>("meta", "lastSync");
}
