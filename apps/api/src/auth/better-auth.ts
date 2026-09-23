import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { jwt } from "better-auth/plugins/jwt";
import { passkey } from "@better-auth/passkey";
import { prisma } from "@songverse/db";
import { getEffectiveAuthSettings, type EffectiveAuthSettings } from "./auth-settings";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";

// Comma-separated list of emails that should be promoted to global admin
// the moment they sign up — there's no other bootstrap path (no "first
// user" logic), so without this every account is an ordinary user until
// someone hand-edits the database.
const bootstrapAdminEmails = new Set(
  (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

// AUTH_URL is this API's own public URL (it's where BetterAuth is
// mounted - see main.ts). WEB_URL is the *browser-facing* app's public
// URL: needed separately because WebAuthn ties a passkey to the origin
// the browser was actually on when registering it (the web app), not to
// wherever the auth server happens to live, and because verification/
// reset-password links redirect back into the web app, which - now that
// it's a different origin from AUTH_URL - has to be explicitly trusted.
const authUrl = new URL(process.env.AUTH_URL ?? "http://localhost:3001");
const webUrl = new URL(process.env.WEB_URL ?? "http://localhost:3000");

/**
 * The parent domain both apps live under (api.songverse.one +
 * songverse.one -> songverse.one), for scoping the session cookie so the
 * web app's own server sees it too. BetterAuth's default when
 * crossSubDomainCookies has no explicit domain is AUTH_URL's full
 * hostname, which would hide the cookie from the web app entirely.
 * `undefined` when both share one host (e.g. localhost in dev), where a
 * plain host-only cookie already reaches both.
 */
function sharedCookieDomain(a: string, b: string): string | undefined {
  if (a === b) return undefined;
  const bLabels = b.split(".").reverse();
  const shared: string[] = [];
  for (const [i, label] of a.split(".").reverse().entries()) {
    if (label !== bLabels[i]) break;
    shared.push(label);
  }
  if (shared.length < 2) {
    throw new Error(
      `AUTH_URL (${a}) and WEB_URL (${b}) must be subdomains of one parent domain (e.g. api.example.com and ` +
        "example.com) - the session cookie set by the API has to be readable by the web app.",
    );
  }
  return shared.reverse().join(".");
}

const cookieDomain = sharedCookieDomain(authUrl.hostname, webUrl.hostname);

/**
 * BetterAuth issues sessions (cookie-based, shared with the web app via
 * cross-subdomain cookies - see `advanced.crossSubDomainCookies` below)
 * and JWTs (also for the web app, which forwards them as Bearer tokens
 * when calling this API's other endpoints - see JwtAuthGuard).
 *
 * The Prisma User model keeps SongVerse's own column names (displayName,
 * avatarUrl) rather than BetterAuth's defaults (name, image) — `user.fields`
 * maps BetterAuth's expected field names onto ours instead of renaming the
 * domain schema. `isGlobalAdmin`/`locale` are registered as additionalFields
 * with `input: false` so BetterAuth's own update-user endpoint rejects any
 * attempt to set them directly (privilege escalation guard) - they're only
 * ever written via the databaseHooks bootstrap logic below, or via this
 * API's own `/users/me` endpoint (see UsersService). Returning them here
 * means the web app's session/get-session call carries everything it needs
 * in one round trip, without a second call back to `/users/me`.
 */
function buildAuth(settings: EffectiveAuthSettings) {
  return betterAuth({
    baseURL: authUrl.origin,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [webUrl.origin],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    advanced: {
      // See sharedCookieDomain above.
      crossSubDomainCookies: cookieDomain ? { enabled: true, domain: cookieDomain } : { enabled: false },
    },
    emailAndPassword: {
      enabled: true,
      // A session is only created once the address is verified - see
      // sendOnSignUp below and the auth-card "check your email" state.
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail(user.email, url);
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail(user.email, url);
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      // Deliberately no sendOnSignIn: resending on every failed sign-in
      // attempt from an unverified account would let anyone burn through the
      // Resend quota just by repeatedly submitting the sign-in form. The UI
      // instead offers an explicit "Resend verification email" action, which
      // hits the rate-limited /send-verification-email endpoint below.
    },
    // Google sign-in is opt-in: the button only appears (see
    // apps/web's auth-card.tsx, fed by GET /auth/public-config) once
    // either this or the GOOGLE_CLIENT_ID/SECRET env vars are set via
    // Admin > Auth. Leaving both unset keeps email+password (and
    // passkeys) as the only sign-in methods.
    socialProviders:
      settings.googleClientId && settings.googleClientSecret
        ? { google: { clientId: settings.googleClientId, clientSecret: settings.googleClientSecret } }
        : undefined,
    // Keeps the low-volume Resend free tier from being exhausted by a script
    // hammering the endpoints that actually send email (or repeatedly
    // re-registering accounts).
    rateLimit: {
      customRules: {
        "/request-password-reset": { window: 600, max: 3 },
        "/send-verification-email": { window: 600, max: 3 },
        "/sign-up/email": { window: 600, max: 5 },
      },
    },
    user: {
      fields: {
        name: "displayName",
        image: "avatarUrl",
      },
      additionalFields: {
        isGlobalAdmin: { type: "boolean", input: false, defaultValue: false },
        locale: { type: "string", input: false, defaultValue: "en" },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // isGlobalAdmin isn't settable through BetterAuth's own create/
          // update input (input: false above) - this writes it directly
          // via Prisma after the row exists, the one legitimate way in.
          after: async (user) => {
            if (bootstrapAdminEmails.has(user.email.toLowerCase())) {
              await prisma.user.update({ where: { id: user.id }, data: { isGlobalAdmin: true } });
            }
          },
        },
      },
    },
    plugins: [
      jwt({
        jwt: {
          // Base user fields only — guards re-derive isGlobalAdmin and other
          // authorization state from Postgres by `sub` rather than trusting
          // token claims (see JwtAuthGuard).
          definePayload: ({ user }) => ({ email: user.email }),
        },
      }),
      passkey({
        // Tied to the web app's origin, not this API's - see the comment
        // on webUrl above.
        rpID: webUrl.hostname,
        rpName: "SongVerse",
        origin: webUrl.origin,
      }),
    ],
  });
}

type Auth = ReturnType<typeof buildAuth>;

let cachedAuth: Auth | undefined;
// The AuthSettings row's updatedAt, as of the build that produced
// cachedAuth - `undefined` means "never built yet", distinct from `null`
// ("built once, from no row at all"). Comparing this on every call is what
// lets an admin's save (which bumps updatedAt via @updatedAt) take effect
// without a restart, in this and every other process, at the cost of one
// cheap indexed lookup per call - see auth-settings.ts's own note on why
// that lookup isn't itself cached.
let cachedUpdatedAtMs: number | null | undefined;

/**
 * Returns the current BetterAuth instance, rebuilding it only when the
 * admin-managed settings (Admin > Auth) have actually changed since the
 * last build.
 */
export async function getAuth(): Promise<Auth> {
  const settings = await getEffectiveAuthSettings();
  const updatedAtMs = settings.updatedAt?.getTime() ?? null;
  if (cachedAuth === undefined || updatedAtMs !== cachedUpdatedAtMs) {
    cachedAuth = buildAuth(settings);
    cachedUpdatedAtMs = updatedAtMs;
  }
  return cachedAuth;
}
