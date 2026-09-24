import { allKeptSets, keepSet, type KeptSet, type OfflineStorage } from "@songverse/core";
import { useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";
import { apiClient } from "#/lib/api-client";
import { getOffline, keysOffline, putOffline } from "#/lib/offline-db";
import { isNetworkError, OfflineError } from "#/lib/offline";

/**
 * Between the route loaders and the API (docs/offline.md, "Loading pages";
 * issue #50): online, pages load from the API as always, and sets are kept
 * on the device as they're opened; offline, pages read what's kept.
 */

/** The device's store, as @songverse/core's offline functions see it. Writes need the signed-in user. */
export function deviceStorage(userId?: string): OfflineStorage {
  return {
    get: (store, key) => getOffline(store, key),
    put: (store, key, value) => (userId ? putOffline(userId, store, key, value) : Promise.resolve()),
    keys: (store) => keysOffline(store),
  };
}

/**
 * Online, from the API. With no network (or the browser knowing it has
 * none), the kept copy instead - or, with nothing kept, the network error,
 * which the page shows as "Not available offline".
 */
export async function onlineOrKept<T>(online: () => Promise<T>, kept: () => Promise<T | undefined>): Promise<T> {
  // Server rendering is always online.
  if (typeof window === "undefined") return online();
  try {
    if (navigator.onLine === false) throw new OfflineError();
    return await online();
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const copy = await kept().catch(() => undefined);
    if (copy === undefined) throw error;
    return copy;
  }
}

// When each set was last downloaded in this tab: at most once a minute.
const REFRESH_MS = 60_000;
const refreshed = new Map<string, number>();

/** Downloads a set and its songs to keep them on the device (online only; failures are quiet). */
export async function refreshKeptSet(userId: string, setlistId: string): Promise<void> {
  if (navigator.onLine === false) return;
  const last = refreshed.get(setlistId);
  if (last && Date.now() - last < REFRESH_MS) return;
  refreshed.set(setlistId, Date.now());
  try {
    await keepSet(deviceStorage(userId), await apiClient.getSetlistOffline(setlistId));
  } catch {
    // Not kept this time (offline, gone, no access): the next visit tries again.
    refreshed.delete(setlistId);
  }
}

/** Keeps the set a page shows on the device, once it's in the browser (a page drawn on the server can't). */
export function useKeepSet(setlistId: string | null | undefined) {
  const { session, offline } = useRouteContext({ from: "/_protected" });
  useEffect(() => {
    if (setlistId && !offline) void refreshKeptSet(session.userId, setlistId);
  }, [setlistId, session.userId, offline]);
}

/** Every set kept on the device (none when there's no device store). */
export function keptSets(): Promise<KeptSet[]> {
  return allKeptSets(deviceStorage()).catch(() => []);
}
