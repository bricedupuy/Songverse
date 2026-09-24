import type { SetlistSummary, SongbookSummary, TeamSummary } from "@songverse/core";
import { apiClient } from "#/lib/api-client";
import { appDataVersion } from "#/lib/app-data-version";
import { forgetOffline, getOffline, putOffline } from "#/lib/offline-db";
import { isNetworkError, OfflineError, withTimeout } from "#/lib/offline";
import { getSession, type AppSession } from "#/lib/server-auth";

export interface AppData {
  session: AppSession;
  teams: TeamSummary[];
  songbooks: SongbookSummary[];
  setlists: SetlistSummary[];
  /** Set when the network is down and this is the copy kept on the device (issue #49): when it was last confirmed. */
  offline?: { savedAt: string };
}

/** The last session and sidebar lists confirmed online, as kept on the device. */
interface SavedAppData {
  data: AppData;
  savedAt: string;
}

// A network that hangs (a venue's Wi-Fi) counts as down after this long.
const NETWORK_TIMEOUT_MS = 8_000;

/** How long the browser reuses the session and sidebar lists when nothing has changed. */
const FRESH_MS = 60_000;
/** Offline, how long before trying the network again (going back online retries at once). */
const OFFLINE_RETRY_MS = 15_000;

let cached: { data: AppData; at: number; version: number } | null = null;
let pending: { promise: Promise<AppData | null>; version: number } | null = null;

async function loadOnline(): Promise<AppData | null> {
  const session = await getSession();
  if (!session) return null;
  const [teams, songbooks, setlists] = await Promise.all([apiClient.listTeams(), apiClient.listSongbooks(), apiClient.listSetlists()]);
  return { session, teams, songbooks, setlists };
}

/**
 * Online, from the server - and kept on the device for an offline launch.
 * The server saying there's no session (signed out here or elsewhere, the
 * account deleted) deletes the device's copy (the sign-in page does too,
 * for a page drawn on the server). Offline, the kept copy, marked
 * `offline`: signed in, read-only.
 */
async function load(): Promise<AppData | null> {
  if (typeof window === "undefined") return loadOnline();
  let data: AppData | null;
  try {
    // The browser knows it has no network: don't wait for a request to fail.
    if (navigator.onLine === false) throw new OfflineError();
    data = await withTimeout(loadOnline(), NETWORK_TIMEOUT_MS);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const saved = await getOffline<SavedAppData>("session", "current").catch(() => undefined);
    if (!saved) throw error;
    return { ...saved.data, offline: { savedAt: saved.savedAt } };
  }
  if (!data) void forgetOffline();
  return data;
}

/**
 * Keeps the session and sidebar lists on the device, for an offline launch.
 * Called by the signed-in layout once it's in the browser - a page drawn on
 * the server loaded them there, where there's no device to keep them on.
 */
export function keepAppDataOffline(data: AppData): void {
  if (data.offline) return;
  const saved: SavedAppData = { data, savedAt: new Date().toISOString() };
  void putOffline(data.session.userId, "session", "current", saved).catch(() => {});
}

/**
 * The signed-in user's session and the sidebar's teams, songbooks and
 * sets (null when signed out). Every page change needs them, so in the
 * browser they're kept for a minute - until anything is changed through
 * the API (see markAppDataStale), which reloads them on the next page.
 * Server rendering always loads them fresh.
 */
export function loadAppData(): Promise<AppData | null> {
  if (typeof window === "undefined") return load();
  const version = appDataVersion;
  if (cached && cached.version === version && Date.now() - cached.at < (cached.data.offline ? OFFLINE_RETRY_MS : FRESH_MS)) {
    return Promise.resolve(cached.data);
  }
  if (pending && pending.version === version) return pending.promise;
  const promise = load().then((data) => {
    cached = data ? { data, at: Date.now(), version } : null;
    return data;
  });
  pending = { promise, version };
  return promise.finally(() => {
    if (pending?.promise === promise) pending = null;
  });
}
