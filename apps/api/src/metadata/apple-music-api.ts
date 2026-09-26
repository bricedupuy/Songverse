import { createHash, createPrivateKey, sign } from "node:crypto";
import type { ProviderMatch } from "@songverse/core";

/** Where the Apple Music API is; pointed elsewhere only by the e2e suites. */
const apiBase = () => (process.env.APPLE_MUSIC_API_URL ?? "https://api.music.apple.com").replace(/\/$/, "");
const TIMEOUT_MS = 8000;
/** A developer token lasts this long (Apple allows up to six months); a new one is made before it runs out. */
const TOKEN_LIFETIME_S = 12 * 60 * 60;

/** A MusicKit key (issue #87): the Apple Developer team, the key's ID and its private key (the .p8 file's text). */
export interface MusicKitCredentials {
  teamId: string;
  keyId: string;
  privateKey: string;
}

/** Why a key can't be used, or null: it must be a P-256 private key, as MusicKit's are. */
export function musicKitKeyProblem(privateKey: string): string | null {
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") return "A MusicKit key is an EC P-256 key (the .p8 file)";
    return null;
  } catch {
    return "That isn't a private key: paste the whole .p8 file, BEGIN and END lines included";
  }
}

const base64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const tokens = new Map<string, { token: string; expiresAt: number }>();

/** A developer token: a JWT signed with the key (ES256), reused until an hour before it runs out. */
export function developerToken(credentials: MusicKitCredentials, now = Date.now()): string {
  const cacheKey = createHash("sha256").update(`${credentials.teamId}\n${credentials.keyId}\n${credentials.privateKey}`).digest("hex");
  const cached = tokens.get(cacheKey);
  if (cached && cached.expiresAt - now > 60 * 60 * 1000) return cached.token;
  const issuedAt = Math.floor(now / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "ES256", kid: credentials.keyId }))}.${base64url(
    JSON.stringify({ iss: credentials.teamId, iat: issuedAt, exp: issuedAt + TOKEN_LIFETIME_S }),
  )}`;
  // JWTs want the raw r||s signature, not DER.
  const signature = sign("sha256", Buffer.from(unsigned), { key: createPrivateKey(credentials.privateKey), dsaEncoding: "ieee-p1363" });
  const token = `${unsigned}.${base64url(signature)}`;
  tokens.set(cacheKey, { token, expiresAt: (issuedAt + TOKEN_LIFETIME_S) * 1000 });
  return token;
}

interface AppleMusicSong {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    releaseDate?: string;
    isrc?: string;
    composerName?: string;
    url?: string;
    artwork?: { url?: string };
  };
}

export class AppleMusicApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(path: string, credentials: MusicKitCredentials): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${developerToken(credentials)}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) throw new AppleMusicApiError(res.status, "Apple Music refused the MusicKit key: check the team ID, key ID and private key");
  if (!res.ok) throw new AppleMusicApiError(res.status, `Apple Music answered ${res.status}`);
  return (await res.json()) as T;
}

/** "Joel Houston, Matt Crocker & Salomon Ligthelm" as names. */
const composersOf = (composerName?: string) =>
  (composerName ?? "")
    .split(/\s*,\s*|\s+&\s+/)
    .map((name) => name.trim())
    .filter(Boolean);

/** Apple's artwork addresses are templates: {w}x{h}, and sometimes {f} for the format. */
const artworkAt = (template: string | undefined, size: number) => template?.replace("{w}", String(size)).replace("{h}", String(size)).replace("{f}", "jpg") ?? null;

function toMatch(song: AppleMusicSong): ProviderMatch | null {
  const a = song.attributes;
  if (!a?.name) return null;
  const composers = composersOf(a.composerName);
  return {
    title: a.name,
    artist: a.artistName ?? null,
    album: a.albumName ?? null,
    releaseDate: a.releaseDate ?? null,
    artworkUrl: artworkAt(a.artwork?.url, 800),
    thumbnailUrl: artworkAt(a.artwork?.url, 200),
    isrc: a.isrc ?? null,
    ...(composers.length > 0 && { composers }),
    // The same catalogue IDs as the iTunes Search API's track IDs.
    source: { provider: "apple_music", id: song.id, url: a.url ?? `https://music.apple.com/song/${song.id}` },
  };
}

/** Songs matching `term` in a storefront (two letters), through the Apple Music API. */
export async function appleMusicSearch(term: string, storefront: string, credentials: MusicKitCredentials): Promise<ProviderMatch[]> {
  const query = new URLSearchParams({ term, types: "songs", limit: "25" });
  const body = await get<{ results?: { songs?: { data?: AppleMusicSong[] } } }>(`/v1/catalog/${storefront}/search?${query}`, credentials);
  return (body.results?.songs?.data ?? []).map(toMatch).filter((match): match is ProviderMatch => !!match);
}

/** One song by its catalogue ID, or null. */
export async function appleMusicSong(id: string, storefront: string, credentials: MusicKitCredentials): Promise<ProviderMatch | null> {
  try {
    const body = await get<{ data?: AppleMusicSong[] }>(`/v1/catalog/${storefront}/songs/${encodeURIComponent(id)}`, credentials);
    const song = body.data?.[0];
    return song ? toMatch(song) : null;
  } catch (err) {
    if (err instanceof AppleMusicApiError && err.status === 404) return null;
    throw err;
  }
}
