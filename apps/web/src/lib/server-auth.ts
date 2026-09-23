import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type LocaleValue } from "@songverse/core";
import { getApiUrl } from "#/lib/public-env";

export interface AppSession {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isGlobalAdmin: boolean;
  locale: LocaleValue;
}

interface BetterAuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  isGlobalAdmin?: boolean;
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
    locale: asLocale(data.user.locale ?? DEFAULT_LOCALE),
  };
}

/** Returns the current session, or null when signed out. Safe to call anywhere. */
export const getSession = createServerFn({ method: "GET" }).handler(loadSession);

/** Mints a short-lived JWT for the current session, for calling the NestJS API. */
export const getApiToken = createServerFn({ method: "GET" }).handler(async () => {
  const cookie = getRequest().headers.get("cookie");
  if (!cookie) return null;

  const response = await fetch(`${getApiUrl()}/api/auth/token`, { headers: { cookie } });
  if (!response.ok) return null;

  const data = (await response.json()) as { token: string } | null;
  return data?.token ?? null;
});
