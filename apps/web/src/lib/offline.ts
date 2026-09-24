/** No network: the browser says so, or a request didn't get through in time. */
export class OfflineError extends Error {
  constructor(message = "Offline") {
    super(message);
    this.name = "OfflineError";
  }
}

/**
 * A request that failed for want of a network - not one the server
 * answered with an error. fetch() rejects with a TypeError when it can't
 * reach the server at all.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof OfflineError || error instanceof TypeError) return true;
  return typeof navigator !== "undefined" && navigator.onLine === false;
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
