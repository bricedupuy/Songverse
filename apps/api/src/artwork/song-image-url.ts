import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;

function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHash("sha256").update(`songverse-song-images:${secret}`).digest();
}

const signature = (songVersionId: string, storageKey: string, expires: number) =>
  createHmac("sha256", key()).update(`${songVersionId}.${storageKey}.${expires}`).digest("base64url");

/**
 * A song's image address (issue #85): signed and expiring, handed out only
 * with the song to someone who can see it, so an <img> can show it without
 * the Bearer token. It expires at the end of the next day (UTC), so it's the
 * same address all day and the browser keeps it.
 */
export function songImageUrl(songVersionId: string, storageKey: string | null, now = Date.now()): string | null {
  if (!storageKey) return null;
  const expires = (Math.floor(now / DAY_MS) + 2) * DAY_MS;
  const apiOrigin = new URL(process.env.AUTH_URL ?? "http://localhost:3001").origin;
  const query = new URLSearchParams({ expires: String(expires), signature: signature(songVersionId, storageKey, expires) });
  return `${apiOrigin}/song-versions/${encodeURIComponent(songVersionId)}/image/${storageKey}?${query}`;
}

export function isValidSongImageSignature(songVersionId: string, storageKey: string, expires: string | undefined, given: string | undefined, now = Date.now()): boolean {
  const at = Number(expires);
  if (!given || !Number.isFinite(at) || at < now) return false;
  const expected = Buffer.from(signature(songVersionId, storageKey, at));
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
