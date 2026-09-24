/**
 * Working with an unreliable network, for every client (web and mobile):
 * telling "no network" from a server's answer, giving up on a network that
 * hangs, and falling back to what's kept on the device (docs/offline.md).
 */

/** No network: the device says so, or a request didn't get through in time. */
export class OfflineError extends Error {
  constructor(message = "Offline") {
    super(message);
    this.name = "OfflineError";
  }
}

/** Whether the device says it has no network at all (browsers and React Native both have `navigator.onLine`). */
export function deviceOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * A request that failed for want of a network - not one the server
 * answered with an error. fetch() rejects with a TypeError when it can't
 * reach the server at all.
 */
export function isNetworkError(error: unknown): boolean {
  return error instanceof OfflineError || error instanceof TypeError || deviceOffline();
}

/** `promise`, or an OfflineError after `ms`: a network that hangs is as good as down. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new OfflineError("The network didn't answer in time")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Online, `online()`. With no network (or the device knowing it has none),
 * `kept()` - the copy on the device - instead; with nothing kept, the
 * network error as is, for the app to say "Not available offline".
 */
export async function onlineOrKept<T>(online: () => Promise<T>, kept: () => Promise<T | undefined>): Promise<T> {
  try {
    if (deviceOffline()) throw new OfflineError();
    return await online();
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const copy = await kept().catch(() => undefined);
    if (copy === undefined) throw error;
    return copy;
  }
}

/** A session (and whatever comes with it) as last confirmed online. */
export interface SavedSession<T> {
  data: T;
  savedAt: string;
}

/**
 * The offline session rule, the same for every client (issue #49):
 * - online, the server decides: a session, or none - and none wipes the
 *   device's offline data (signed out here or elsewhere, account deleted);
 * - with no network, or none within `timeoutMs`, the session last confirmed
 *   online: signed in, read-only (`savedAt` says how fresh it is);
 * - a server error is neither: it's thrown, and never wipes anything.
 */
export async function sessionOnlineOrSaved<T>(options: {
  online: () => Promise<T | null>;
  saved: () => Promise<SavedSession<T> | undefined>;
  forget: () => Promise<void>;
  timeoutMs?: number;
}): Promise<{ data: T; savedAt: string | null } | null> {
  let data: T | null;
  try {
    if (deviceOffline()) throw new OfflineError();
    data = await withTimeout(options.online(), options.timeoutMs ?? 8_000);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const saved = await options.saved().catch(() => undefined);
    if (!saved) throw error;
    return { data: saved.data, savedAt: saved.savedAt };
  }
  if (!data) {
    await options.forget().catch(() => {});
    return null;
  }
  return { data, savedAt: null };
}
