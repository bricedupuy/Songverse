/**
 * Bumped whenever the app changes something through the API, so the
 * signed-in layout's cached session and sidebar lists (lib/app-data.ts)
 * are reloaded on the next navigation instead of reused. Its own module so
 * the API client can bump it without importing what it's cached from.
 */
export let appDataVersion = 0;

export function markAppDataStale(): void {
  appDataVersion++;
}
