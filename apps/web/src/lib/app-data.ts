import type { SetlistSummary, SongbookSummary, TeamSummary } from "@songverse/core";
import { apiClient } from "#/lib/api-client";
import { appDataVersion } from "#/lib/app-data-version";
import { getSession, type AppSession } from "#/lib/server-auth";

export interface AppData {
  session: AppSession;
  teams: TeamSummary[];
  songbooks: SongbookSummary[];
  setlists: SetlistSummary[];
}

/** How long the browser reuses the session and sidebar lists when nothing has changed. */
const FRESH_MS = 60_000;

let cached: { data: AppData; at: number; version: number } | null = null;
let pending: { promise: Promise<AppData | null>; version: number } | null = null;

async function load(): Promise<AppData | null> {
  const session = await getSession();
  if (!session) return null;
  const [teams, songbooks, setlists] = await Promise.all([apiClient.listTeams(), apiClient.listSongbooks(), apiClient.listSetlists()]);
  return { session, teams, songbooks, setlists };
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
  if (cached && cached.version === version && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.data);
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
