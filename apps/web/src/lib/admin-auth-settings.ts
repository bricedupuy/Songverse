import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@songverse/db";
import { encryptSecret, MissingEncryptionKeyError } from "@songverse/secret-crypto";
import type { AuthConfigSource } from "#/lib/auth-settings";
import { ensureGlobalAdmin } from "#/lib/server-auth";

const SINGLETON_ID = "singleton";
const DEFAULT_EMAIL_FROM = "SongVerse <onboarding@resend.dev>";

export interface AuthSettingsSummary {
  emailSource: AuthConfigSource;
  emailFrom: string;
  hasDatabaseResendKey: boolean;
  googleSource: AuthConfigSource;
  googleClientId: string | null;
  hasDatabaseGoogleSecret: boolean;
}

/**
 * Admin-only summary for the Admin > Auth panel. Never returns a decrypted
 * or masked secret (matching StorageService.getConfigSummary()'s
 * discipline for the R2 secret key) - only whether the database holds one,
 * so the UI can show "leave blank to keep the current one" without ever
 * needing SETTINGS_ENCRYPTION_KEY just to render the page.
 */
export const getAuthSettingsSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthSettingsSummary> => {
    await ensureGlobalAdmin();
    const row = await prisma.authSettings.findUnique({ where: { id: SINGLETON_ID } });

    const hasDatabaseResendKey = Boolean(row?.resendApiKeyEnc);
    const hasDatabaseGoogleSecret = Boolean(row?.googleClientId && row.googleClientSecretEnc);

    return {
      emailSource: hasDatabaseResendKey ? "database" : process.env.RESEND_API_KEY ? "env" : "none",
      emailFrom: row?.emailFrom ?? process.env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
      hasDatabaseResendKey,
      googleSource: hasDatabaseGoogleSecret
        ? "database"
        : process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
          ? "env"
          : "none",
      googleClientId: row?.googleClientId ?? null,
      hasDatabaseGoogleSecret,
    };
  },
);

export interface SaveAuthSettingsInput {
  resendApiKey?: string;
  emailFrom?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

/**
 * Partial update, like PATCH: a field left `undefined` keeps its current
 * value (so the admin never has to re-enter a secret just to change
 * emailFrom, say); an empty string clears it. Mirrors
 * StorageService.saveConfig()'s exact semantics.
 */
export const saveAuthSettings = createServerFn({ method: "POST" })
  .validator((input: SaveAuthSettingsInput) => input)
  .handler(async ({ data }) => {
    await ensureGlobalAdmin();
    const passphrase = process.env.SETTINGS_ENCRYPTION_KEY;

    try {
      const resendApiKeyEnc =
        data.resendApiKey !== undefined ? (data.resendApiKey ? encryptSecret(data.resendApiKey, passphrase) : null) : undefined;
      const googleClientSecretEnc =
        data.googleClientSecret !== undefined
          ? data.googleClientSecret
            ? encryptSecret(data.googleClientSecret, passphrase)
            : null
          : undefined;

      await prisma.authSettings.upsert({
        where: { id: SINGLETON_ID },
        create: {
          id: SINGLETON_ID,
          resendApiKeyEnc: resendApiKeyEnc ?? null,
          emailFrom: data.emailFrom || null,
          googleClientId: data.googleClientId || null,
          googleClientSecretEnc: googleClientSecretEnc ?? null,
        },
        update: {
          ...(resendApiKeyEnc !== undefined && { resendApiKeyEnc }),
          ...(data.emailFrom !== undefined && { emailFrom: data.emailFrom || null }),
          ...(data.googleClientId !== undefined && { googleClientId: data.googleClientId || null }),
          ...(googleClientSecretEnc !== undefined && { googleClientSecretEnc }),
        },
      });
    } catch (err) {
      if (err instanceof MissingEncryptionKeyError) {
        throw new Response(err.message, { status: 400 });
      }
      throw err;
    }
  });

export const clearEmailSettings = createServerFn({ method: "POST" }).handler(async () => {
  await ensureGlobalAdmin();
  await prisma.authSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, resendApiKeyEnc: null, emailFrom: null },
    update: { resendApiKeyEnc: null, emailFrom: null },
  });
});

export const clearGoogleSettings = createServerFn({ method: "POST" }).handler(async () => {
  await ensureGlobalAdmin();
  await prisma.authSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, googleClientId: null, googleClientSecretEnc: null },
    update: { googleClientId: null, googleClientSecretEnc: null },
  });
});
