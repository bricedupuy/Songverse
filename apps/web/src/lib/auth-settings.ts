import { prisma } from "@songverse/db";
import { decryptSecret } from "@songverse/secret-crypto";

const SINGLETON_ID = "singleton";
const DEFAULT_EMAIL_FROM = "SongVerse <onboarding@resend.dev>";

export type AuthConfigSource = "database" | "env" | "none";

export interface EffectiveAuthSettings {
  resendApiKey: string | undefined;
  emailFrom: string;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  /** Cache-invalidation key for auth.ts's getAuth() - null when no row exists. */
  updatedAt: Date | null;
}

/**
 * Resolves live Resend/Google config: admin-managed database settings
 * (AuthSettings, edited via Admin > Auth - see admin-auth-settings.ts)
 * first, then the matching env var. Called fresh on every use rather than
 * cached in memory - the same cross-process-staleness reason as
 * StorageService (apps/api/src/storage/storage.service.ts): apps/web can
 * run as several replicas that share no memory, so an admin's save
 * through one process needs to be visible to requests served by another
 * without a restart. It's one cheap indexed lookup per call.
 *
 * Deliberately has no dependency on server-auth.ts/auth.ts, even though
 * it's the thing they both build on - admin-auth-settings.ts (which does
 * depend on server-auth.ts, for its admin-only guard) is the one place
 * that also reads/writes the AuthSettings row, and it never depends back
 * on this file's callers, so nothing here would create a cycle.
 */
export async function getEffectiveAuthSettings(): Promise<EffectiveAuthSettings> {
  const row = await prisma.authSettings.findUnique({ where: { id: SINGLETON_ID } });
  const passphrase = process.env.SETTINGS_ENCRYPTION_KEY;

  return {
    resendApiKey: row?.resendApiKeyEnc ? decryptSecret(row.resendApiKeyEnc, passphrase) : process.env.RESEND_API_KEY,
    emailFrom: row?.emailFrom ?? process.env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
    googleClientId: row?.googleClientId ?? process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: row?.googleClientSecretEnc
      ? decryptSecret(row.googleClientSecretEnc, passphrase)
      : process.env.GOOGLE_CLIENT_SECRET,
    updatedAt: row?.updatedAt ?? null,
  };
}
