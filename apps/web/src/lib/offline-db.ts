/**
 * What SongVerse keeps on this device to work offline (docs/offline.md,
 * issue #25): one IndexedDB database per signed-in user, so nothing of one
 * user's is ever read while another is signed in. The last user's ID is
 * remembered (in localStorage) because an offline launch has no server to
 * ask who's signed in.
 */

const USER_KEY = "songverse.offline.user";
const DB_PREFIX = "songverse-offline-";
const VERSION = 1;
/** The stores the design plans for; step 1 (#49) uses `session`. */
export const OFFLINE_STORES = ["session", "sets", "songs", "songbooks", "files", "meta"] as const;
export type OfflineStoreName = (typeof OFFLINE_STORES)[number];

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

function lastUser(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function open(userId: string): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_PREFIX + userId, VERSION);
  req.onupgradeneeded = () => {
    for (const name of OFFLINE_STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
  };
  return request(req);
}

async function withStore<T>(userId: string, store: OfflineStoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open(userId);
  try {
    return await request(run(db.transaction(store, mode).objectStore(store)));
  } finally {
    db.close();
  }
}

/** Keeps `value` for `userId`, who becomes the user an offline launch opens as. */
export async function putOffline(userId: string, store: OfflineStoreName, key: string, value: unknown): Promise<void> {
  if (!available()) return;
  const previous = lastUser();
  // Someone else signed in on this device: the previous user's copy goes.
  if (previous && previous !== userId) await forgetOffline();
  try {
    localStorage.setItem(USER_KEY, userId);
  } catch {
    // Storage blocked: an offline launch won't know whose copy to open.
  }
  await withStore(userId, store, "readwrite", (s) => s.put(value, key));
}

/** Something kept for the last signed-in user, if anything. */
export async function getOffline<T>(store: OfflineStoreName, key: string): Promise<T | undefined> {
  const userId = lastUser();
  if (!available() || !userId) return undefined;
  return withStore<T | undefined>(userId, store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
}

/** Deletes everything kept on this device: on signing out, or when the session is gone. */
export async function forgetOffline(): Promise<void> {
  const userId = lastUser();
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    // Nothing to remove.
  }
  if (!available() || !userId) return;
  await request(indexedDB.deleteDatabase(DB_PREFIX + userId)).catch(() => {});
}
