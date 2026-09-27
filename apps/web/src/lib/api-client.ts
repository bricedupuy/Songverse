import { markAppDataStale } from "#/lib/app-data-version";
import { createApiClient } from "@songverse/core";
import { getApiUrl } from "./public-env";
import { getApiToken } from "./server-auth";

// Re-mint this long before the token actually expires, so a request never
// leaves with a token that lapses on the way.
const EXPIRY_MARGIN_MS = 60_000;

let cached: { token: string; expiresAt: number } | null = null;
let pending: Promise<string | null> | null = null;

/** The JWT's `exp`, in ms; 0 (don't cache) when it can't be read. */
function expiresAt(token: string): number {
  try {
    const payload = token.split(".")[1] ?? "";
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * In the browser, one token is reused until shortly before it expires, and
 * concurrent callers share a single request for a new one - rather than a
 * server-function round trip (and a call to the API's /api/auth/token) for
 * every API request, which a quick run of page changes turned into dozens
 * a second. Sign-in and sign-out both reload the page, which clears this.
 * On the server, getApiToken already reuses one token per page render.
 */
function getToken(): Promise<string | null> {
  if (typeof window === "undefined") return getApiToken();
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return Promise.resolve(cached.token);
  pending ??= getApiToken()
    .then((token) => {
      cached = token ? { token, expiresAt: expiresAt(token) } : null;
      return token;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** The API token, for what isn't a plain API call: Sync play's WebSocket signs in with it (issue #13). */
export const apiToken = getToken;
/** A token the API refused: the next one is fresh. */
export function forgetApiToken() {
  cached = null;
}

/**
 * Shared instance for calling the NestJS API from web routes/components.
 * `getApiToken` is a TanStack Start server function — calling it works
 * identically during SSR and from the browser.
 */
export const apiClient = createApiClient({
  baseUrl: getApiUrl(),
  getToken,
  onUnauthorized: () => {
    cached = null;
  },
  onChange: markAppDataStale,
});
