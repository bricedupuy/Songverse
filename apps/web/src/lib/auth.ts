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
