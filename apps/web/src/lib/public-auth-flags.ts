import { createServerFn } from "@tanstack/react-start";
import { getEffectiveAuthSettings } from "#/lib/auth-settings";

/**
 * Public-facing check for whether Google sign-in is configured, called
 * from the two unauthenticated pages that render <AuthCard> (index.tsx,
 * join.$token.tsx) via their own beforeLoad.
 *
 * This has to be the only kind of export in this file - a createServerFn,
 * calling a plain function defined in a *different* module
 * (getEffectiveAuthSettings) - never a plain function itself. TanStack
 * Start only code-splits a createServerFn's own handler out of the client
 * bundle; a plain async function's body ships to the browser as ordinary
 * isomorphic code wherever it's reachable, which would drag Prisma and
 * @songverse/secret-crypto's node:crypto usage into client JS the moment
 * anything in the same file exported it directly (verified by inspecting
 * the built client chunks - see git history for this file). Mirrors
 * server-auth.ts's exact same discipline (it calls auth.ts's getAuth(),
 * never inlines it).
 */
export const getHasGoogleAuth = createServerFn({ method: "GET" }).handler(async (): Promise<boolean> => {
  const settings = await getEffectiveAuthSettings();
  return Boolean(settings.googleClientId && settings.googleClientSecret);
});
