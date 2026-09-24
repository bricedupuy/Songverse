import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, localeFromAcceptLanguage, type LocaleValue } from "@songverse/core";
import { getApiUrl } from "#/lib/public-env";

export interface AppSession {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isGlobalAdmin: boolean;
  /** May review songs submitted to the global catalogue (global admins always can). */
  isReviewer: boolean;
  locale: LocaleValue;
}

interface BetterAuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  isGlobalAdmin?: boolean;
  isReviewer?: boolean;
  locale?: string;
}

function asLocale(value: string): LocaleValue {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value) ? (value as LocaleValue) : DEFAULT_LOCALE;
}

/**
 * BetterAuth itself runs in apps/api now (see apps/api/src/auth/) - this
 * forwards the incoming request's session cookie there and reads back
 * `{session, user}` (or null) over HTTP, rather than calling an in-process
 * `auth.api.getSession()` the way this worked when auth lived in this app.
 * `isGlobalAdmin`/`locale` come back on `user` because they're registered
 * as BetterAuth additionalFields (see apps/api's better-auth.ts) - that
 * keeps this to one HTTP round trip instead of a second call to
 * `/users/me` just to get them.
 */
async function loadSession(): Promise<AppSession | null> {
  const cookie = getRequest().headers.get("cookie");
  const response = await fetch(`${getApiUrl()}/api/auth/get-session`, {
    headers: cookie ? { cookie } : undefined,
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { user: BetterAuthUser } | null;
  if (!data?.user) return null;

  return {
    userId: data.user.id,
    email: data.user.email,
    displayName: data.user.name,
    avatarUrl: data.user.image ?? null,
    isGlobalAdmin: Boolean(data.user.isGlobalAdmin),
    isReviewer: Boolean(data.user.isReviewer),
    locale: asLocale(data.user.locale ?? DEFAULT_LOCALE),
  };
}

/** Returns the current session, or null when signed out. Safe to call anywhere. */
export const getSession = createServerFn({ method: "GET" }).handler(loadSession);

/** A signed-out visitor's language, from their browser's Accept-Language. */
export const getVisitorLocale = createServerFn({ method: "GET" }).handler(() =>
  localeFromAcceptLanguage(getRequest().headers.get("accept-language")),
);

async function mintApiToken(cookie: string): Promise<string | null> {
  const response = await fetch(`${getApiUrl()}/api/auth/token`, { headers: { cookie } });
  // 401 just means there's no valid session.
  if (response.status === 401) return null;
  // Anything else is a real failure; say so rather than returning null and
  // letting the API call go out unauthenticated ("Missing bearer token").
  if (!response.ok) throw new Error(`Couldn't get an API token from the auth server (HTTP ${response.status})`);

  const data = (await response.json()) as { token: string } | null;
  return data?.token ?? null;
}

// One token per incoming request: a server-rendered page makes several API
// calls (layout data, then the page's own), and they can all share it.
const tokensByRequest = new WeakMap<Request, Promise<string | null>>();

/** Mints a short-lived JWT for the current session, for calling the NestJS API. */
export const getApiToken = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  let token = tokensByRequest.get(request);
  if (!token) {
    token = mintApiToken(cookie);
    tokensByRequest.set(request, token);
  }
  return token;
});
