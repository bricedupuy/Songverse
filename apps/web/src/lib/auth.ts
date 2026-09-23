import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { jwt } from "better-auth/plugins/jwt";
import { passkey } from "@better-auth/passkey";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { prisma } from "@songverse/db";
import { sendPasswordResetEmail, sendVerificationEmail } from "#/lib/email";
// Forces TS to have a portable module specifier for zod's internal "v4/core"
// types (better-auth's own zod dependency), avoiding TS2742 "inferred type
// of 'auth' cannot be named" on the export below — see apps/web/README notes
// in this file's git history for the underlying pnpm/zod-v4 friction.
import type {} from "zod/v4/core";

// Comma-separated list of emails that should be promoted to global admin
// the moment they sign up — there's no other bootstrap path (no "first
// user" logic, no admin UI yet), so without this every account is an
// ordinary user until someone hand-edits the database.
const bootstrapAdminEmails = new Set(
  (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

const authUrl = new URL(process.env.AUTH_URL ?? "http://localhost:3000");

// Google sign-in is opt-in: the button only appears (see public-env.ts /
// auth-card.tsx) once both of these are set. Leaving them unset keeps
// email+password (and passkeys) as the only sign-in methods.
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/**
 * BetterAuth issues sessions (cookie-based, for the web app) and JWTs (for
 * the NestJS API — see apps/api's JwtVerifierService, which verifies
 * against this server's JWKS at /api/auth/jwks).
 *
 * The Prisma User model keeps SongVerse's own column names (displayName,
 * avatarUrl) rather than BetterAuth's defaults (name, image) — `user.fields`
 * maps BetterAuth's expected field names onto ours instead of renaming the
 * domain schema.
 */
export const auth = betterAuth({
  baseURL: process.env.AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
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
  socialProviders:
    googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
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
  },
  databaseHooks: {
    user: {
      create: {
        // isGlobalAdmin isn't a field BetterAuth's own schema knows about
        // (it's ours, not registered via user.additionalFields), so this
        // writes it directly via Prisma after the row exists rather than
        // trying to route it through BetterAuth's create data.
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
        // Base user fields only — the API re-derives isGlobalAdmin and other
        // authorization state from Postgres by `sub` rather than trusting
        // token claims (see apps/api JwtAuthGuard).
        definePayload: ({ user }) => ({ email: user.email }),
      },
    }),
    passkey({
      rpID: authUrl.hostname,
      rpName: "SongVerse",
      origin: authUrl.origin,
    }),
    // Must be last: patches every endpoint's response to also set
    // TanStack Start cookies, per BetterAuth's TanStack Start integration.
    tanstackStartCookies(),
  ],
});
