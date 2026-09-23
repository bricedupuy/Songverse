import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encrypts/decrypts admin-entered secrets (R2 credentials, Resend API key,
 * Google OAuth client secret, ...) before they touch the database, using
 * AES-256-GCM with a key derived from SETTINGS_ENCRYPTION_KEY. This is a
 * separate, smaller trust boundary than "move all config out of env": the
 * app still needs *one* secret from the environment to protect whatever
 * secrets an admin later stores in the database - there's no way around
 * that without an external secrets manager. The payoff is that
 * credentials become editable from the admin UI without a redeploy.
 *
 * The scrypt salt is a fixed, non-secret string - only the passphrase
 * (SETTINGS_ENCRYPTION_KEY) needs to stay secret, same as how a
 * password-derived key works anywhere else. Shared by apps/api (object
 * storage credentials) and apps/web (Resend/Google credentials), which is
 * why it lives here rather than in either app. Kept as its original,
 * storage-specific value (rather than renamed to something generic) so
 * any secret already saved through the Storage admin panel before this
 * module existed still decrypts correctly - changing it would silently
 * break every previously-saved credential.
 */
const SCRYPT_SALT = "songverse-storage-settings-v1";

function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, SCRYPT_SALT, 32);
}

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      "SETTINGS_ENCRYPTION_KEY is not set - required to save secrets through an admin dashboard. " +
        "Set it (any long random string) to enable this, or keep configuring via environment variables instead.",
    );
  }
}

export function encryptSecret(plaintext: string, passphrase: string | undefined): string {
  if (!passphrase) throw new MissingEncryptionKeyError();
  const key = deriveKey(passphrase);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64")).join(".");
}

export function decryptSecret(stored: string, passphrase: string | undefined): string {
  if (!passphrase) throw new MissingEncryptionKeyError();
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret");
  }
  const key = deriveKey(passphrase);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Shows just enough of a secret to recognize it without exposing it - e.g. "••••ab12". */
export function maskSecret(value: string): string {
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}
