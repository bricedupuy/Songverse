import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { jwt } from "better-auth/plugins/jwt";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { prisma } from "@songverse/db";
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
    // Must be last: patches every endpoint's response to also set
    // TanStack Start cookies, per BetterAuth's TanStack Start integration.
    tanstackStartCookies(),
  ],
});
