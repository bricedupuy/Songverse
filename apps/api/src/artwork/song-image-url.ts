import { isValidAddress, signAddress } from "../common/utils/signed-address";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The end of the next day (UTC): the same address all day, so the browser keeps the image. */
const imageExpiry = (now: number) => (Math.floor(now / DAY_MS) + 2) * DAY_MS;
const apiOrigin = () => new URL(process.env.AUTH_URL ?? "http://localhost:3001").origin;

/**
 * A song's image address (issue #85): signed and expiring (see
 * signed-address.ts), handed out only with the song to someone who can see
 * it, so an <img> can show it without the Bearer token.
 */
export function songImageUrl(songVersionId: string, storageKey: string | null, now = Date.now()): string | null {
  if (!storageKey) return null;
  const expires = imageExpiry(now);
  const query = new URLSearchParams({ expires: String(expires), signature: signAddress("song-images", `${songVersionId}.${storageKey}`, expires) });
  return `${apiOrigin()}/song-versions/${encodeURIComponent(songVersionId)}/image/${storageKey}?${query}`;
}

export function isValidSongImageSignature(songVersionId: string, storageKey: string, expires: string | undefined, given: string | undefined, now = Date.now()): boolean {
  return isValidAddress("song-images", `${songVersionId}.${storageKey}`, expires, given, now);
}

/** An artist's picture address (issue #86): signed and expiring like a song's, handed out with the artist. */
export function artistImageUrl(artistId: string, storageKey: string | null, now = Date.now()): string | null {
  if (!storageKey) return null;
  const expires = imageExpiry(now);
  const query = new URLSearchParams({ expires: String(expires), signature: signAddress("song-images", `artist:${artistId}.${storageKey}`, expires) });
  return `${apiOrigin()}/artists/${encodeURIComponent(artistId)}/image/${storageKey}?${query}`;
}

export function isValidArtistImageSignature(artistId: string, storageKey: string, expires: string | undefined, given: string | undefined, now = Date.now()): boolean {
  return isValidAddress("song-images", `artist:${artistId}.${storageKey}`, expires, given, now);
}
