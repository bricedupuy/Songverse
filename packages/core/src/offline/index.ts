import type {
  Attachment,
  OfflinePin,
  OfflineSyncResponse,
  SetlistDetail,
  SetlistOfflineCopy,
  SetlistSongView,
  SongbookDetail,
  SongbookEntryHit,
  SongbookOfflineCopy,
  SongOfflineCopy,
} from "../api-client/index.js";
import type { CapoDisplayModeValue, ChordNotationValue } from "../constants/index.js";
import type { SongDocumentV2 } from "../schemas/song-document-v2.js";
import { entryCodeMatches, songbookMatches, songbookReferences } from "../songbook-references/index.js";

/**
 * What a device keeps to work offline (docs/offline.md, issues #25 and
 * #50), as plain functions over a storage interface: the web app gives it
 * IndexedDB, a mobile app (#28) its own store.
 */
export type OfflineStoreKey = "sets" | "songs" | "songbooks" | "files" | "meta";
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

/** A song as kept on the device (issue #52): its copy, whether its audio comes too, and when it was downloaded. */
export interface KeptSongCopy extends SongOfflineCopy {
  audio: boolean;
  savedAt: string;
}

export interface KeptSongbook extends SongbookOfflineCopy {
  savedAt: string;
}

export async function keptSongCopy(storage: OfflineStorage, songVersionId: string): Promise<KeptSongCopy | undefined> {
  return storage.get<KeptSongCopy>("songs", songVersionId);
}

export async function keptSongbook(storage: OfflineStorage, songbookId: string): Promise<SongbookDetail | undefined> {
  return (await storage.get<KeptSongbook>("songbooks", songbookId))?.songbook;
}

async function all<T>(storage: OfflineStorage, store: OfflineStoreKey): Promise<T[]> {
  const values = await Promise.all((await storage.keys(store)).map((key) => storage.get<T>(store, key)));
  return values.filter((value): value is Awaited<T> & T => value !== undefined);
}

export const allKeptSongs = (storage: OfflineStorage) => all<KeptSongCopy>(storage, "songs");
export const allKeptSongbooks = (storage: OfflineStorage) => all<KeptSongbook>(storage, "songbooks");

/** A song readable offline: from the songs kept on their own, or else as it's written in a kept set. */
export interface FoundSong {
  songVersionId: string;
  title: string;
  versionName: string | null;
  /** One line; null when only known from a set. */
  artists: string | null;
  document: SongDocumentV2;
  /** The song's own capo: a suggestion. */
  capo: number | null;
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function artistLine(song: SongOfflineCopy["song"]): string | null {
  const names = song.artists.map((artist) => artist.source ?? artist.userId ?? "").filter(Boolean);
  return names.length > 0 ? names.join(", ") : null;
}

/** Every song readable offline, each once: kept songs first (they have more), then the songs of kept sets. */
export async function allFoundSongs(storage: OfflineStorage): Promise<FoundSong[]> {
  const found = new Map<string, FoundSong>();
  for (const { song } of await allKeptSongs(storage)) {
    found.set(song.id, {
      songVersionId: song.id,
      title: song.title,
      versionName: song.versionName,
      artists: artistLine(song),
      document: song.documentJson,
      capo: song.capo,
    });
  }
  for (const set of await allKeptSets(storage)) {
    for (const view of set.songs) {
      const song = view.song;
      if (!song || found.has(song.id)) continue;
      found.set(song.id, { songVersionId: song.id, title: song.title, versionName: song.versionName, artists: null, document: song.document, capo: song.suggestedCapo });
    }
  }
  return [...found.values()];
}

/** The songs readable offline whose title, version or artists match `query` (case and accents ignored). */
export async function searchKeptSongs(storage: OfflineStorage, query: string, limit = 8): Promise<FoundSong[]> {
  const q = fold(query.trim());
  return (await allFoundSongs(storage))
    .filter((song) => !q || [song.title, song.versionName, song.artists].some((text) => text && fold(text).includes(q)))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, limit);
}

export async function findKeptSong(storage: OfflineStorage, songVersionId: string): Promise<FoundSong | undefined> {
  return (await allFoundSongs(storage)).find((song) => song.songVersionId === songVersionId);
}

/** Entries of the songbooks kept on the device that `query` reads as ("HY 42"), as the API's search finds them. */
export async function searchKeptEntries(storage: OfflineStorage, query: string, limit = 8): Promise<SongbookEntryHit[]> {
  const references = songbookReferences(query);
  if (references.length === 0) return [];
  const hits: (SongbookEntryHit & { rank: number })[] = [];
  for (const { songbook } of await allKeptSongbooks(storage)) {
    for (const entry of songbook.entries) {
      const rank = references.findIndex((reference) => entryCodeMatches(entry.entryCode, reference.code) && songbookMatches(songbook, reference.book));
      if (rank === -1) continue;
      hits.push({
        rank,
        songbookId: songbook.id,
        songbookName: songbook.name,
        abbreviation: songbook.abbreviation,
        entryCode: entry.entryCode!,
        songVersionId: entry.songVersionId,
        title: entry.songVersionTitle ?? "",
      });
    }
  }
  return hits
    .sort((a, b) => a.rank - b.rank || a.songbookName.localeCompare(b.songbookName))
    .slice(0, limit)
    .map(({ rank: _rank, ...hit }) => hit);
}

/** The user's chord settings, as of the last sync, for songs shown on their own. */
export interface OfflineViewer {
  chordNotation: ChordNotationValue;
  capoDisplayMode: CapoDisplayModeValue;
}

export async function offlineViewer(storage: OfflineStorage): Promise<OfflineViewer | undefined> {
  return storage.get<OfflineViewer>("meta", "viewer");
}

export async function offlinePins(storage: OfflineStorage): Promise<OfflinePin[]> {
  return (await storage.get<OfflinePin[]>("meta", "pins")) ?? [];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a sync did, and when it last ran. */
export interface OfflineSyncResult {
  at: string;
  updated: number;
  removed: number;
  kept: number;
}

type Known = { id: string; version: string }[];

/**
 * Brings the device's copy up to date (issues #51, #52): sends the versions
 * of what it keeps (sets, songs, songbooks), stores the copies that changed
 * or are new, removes what's gone (deleted, access lost, unpinned), and
 * drops sets a day after their date. `send` is POST /offline/sync.
 */
export async function syncKeptSets(
  storage: OfflineStorage,
  send: (known: Known, knownSongs: Known, knownSongbooks: Known) => Promise<OfflineSyncResponse>,
  now = new Date(),
): Promise<OfflineSyncResult> {
  const versions = async (store: "songs" | "songbooks") => (await all<{ version?: string; song?: { id: string }; songbook?: { id: string } }>(storage, store)).map((kept) => ({ id: (kept.song ?? kept.songbook)!.id, version: kept.version ?? "" }));
  const before = await allKeptSets(storage);
  const response = await send(
    before.map((kept) => ({ id: kept.set.id, version: kept.version ?? "" })),
    await versions("songs"),
    await versions("songbooks"),
  );
  let updated = 0;
  let removed = 0;
  const savedAt = now.toISOString();

  for (const id of response.gone) {
    await storage.delete("sets", id);
    removed++;
  }
  for (const entry of response.sets) {
    if (!entry.copy) continue;
    await keepSet(storage, entry.copy, now);
    updated++;
  }
  for (const id of response.goneSongbooks ?? []) {
    await storage.delete("songbooks", id);
    removed++;
  }
  for (const entry of response.songbooks ?? []) {
    if (!entry.copy) continue;
    await storage.put("songbooks", entry.id, { ...entry.copy, savedAt } satisfies KeptSongbook);
    updated++;
  }
  for (const id of response.goneSongs ?? []) {
    await storage.delete("songs", id);
    removed++;
  }
  for (const entry of response.songs ?? []) {
    if (entry.copy) {
      await storage.put("songs", entry.id, { ...entry.copy, audio: entry.audio, savedAt } satisfies KeptSongCopy);
      updated++;
    } else {
      // Same song, but its audio may have been asked for (or no longer).
      const kept = await keptSongCopy(storage, entry.id);
      if (kept && kept.audio !== entry.audio) await storage.put("songs", entry.id, { ...kept, audio: entry.audio });
    }
  }
  if (response.viewer) await storage.put("meta", "viewer", response.viewer);
  if (response.pins) await storage.put("meta", "pins", response.pins);

  // A set drops off the device a day after its date.
  const yesterday = new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
  for (const kept of await allKeptSets(storage)) {
    if (kept.set.eventDate && kept.set.eventDate < yesterday) {
      await storage.delete("sets", kept.set.id);
      removed++;
    }
  }
  const result: OfflineSyncResult = { at: savedAt, updated, removed, kept: (await storage.keys("sets")).length };
  await storage.put("meta", "lastSync", result);
  return result;
}

export async function lastOfflineSync(storage: OfflineStorage): Promise<OfflineSyncResult | undefined> {
  return storage.get<OfflineSyncResult>("meta", "lastSync");
}

/** A file the device should have: a kept song's PDF, image, ChordPro... and its audio only when asked for. */
export interface WantedFile {
  songVersionId: string;
  attachment: Attachment;
}

export async function wantedFiles(storage: OfflineStorage): Promise<WantedFile[]> {
  return (await allKeptSongs(storage)).flatMap((kept) =>
    kept.attachments.filter((file) => file.type !== "AUDIO" || kept.audio).map((attachment) => ({ songVersionId: kept.song.id, attachment })),
  );
}

/**
 * Brings the device's files in line with its kept songs (issue #52): downloads
 * the ones it's missing (by attachment, which never changes once uploaded) and
 * removes the ones no longer wanted. A failed download is retried next time.
 */
export async function syncKeptFiles(
  storage: OfflineStorage,
  download: (file: WantedFile) => Promise<unknown>,
): Promise<{ downloaded: number; removed: number }> {
  const wanted = await wantedFiles(storage);
  const have = new Set(await storage.keys("files"));
  let downloaded = 0;
  for (const file of wanted) {
    if (have.has(file.attachment.id)) continue;
    try {
      await storage.put("files", file.attachment.id, await download(file));
      downloaded++;
    } catch {
      // Next sync.
    }
  }
  const keep = new Set(wanted.map((file) => file.attachment.id));
  let removed = 0;
  for (const id of have) {
    if (keep.has(id)) continue;
    await storage.delete("files", id);
    removed++;
  }
  return { downloaded, removed };
}

/** A kept file (a Blob on the web), if the device has it. */
export async function keptFile<T = unknown>(storage: OfflineStorage, attachmentId: string): Promise<T | undefined> {
  return storage.get<T>("files", attachmentId);
}
export * from "./network.js";
