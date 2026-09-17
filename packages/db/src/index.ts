import { PrismaClient } from "@prisma/client";

declare global {
  var __songversePrisma: PrismaClient | undefined;
}

/**
 * Shared Prisma client singleton. Reused across hot reloads in dev (NestJS
 * watch mode, TanStack Start dev server) to avoid exhausting Postgres
 * connections.
 */
export const prisma = globalThis.__songversePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__songversePrisma = prisma;
}

export * from "@prisma/client";
export * from "./seed.js";
