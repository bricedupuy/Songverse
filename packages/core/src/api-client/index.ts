import type { MusicBrainzRecordingMatch, MusicBrainzWorkMatch } from "../schemas/musicbrainz.js";
import type { SongDocument } from "../schemas/song-document.js";

export interface ApiClientOptions {
  baseUrl: string;
  /** Resolves the current bearer token, or null when signed out. */
  getToken: () => Promise<string | null>;
}

export interface SongVersionSummary {
  id: string;
  workId: string;
  title: string;
  alternateTitle: string | null;
  language: string;
  ownerScope: "GLOBAL" | "TEAM" | "USER";
  publicationState: string;
  ccli: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VersionContributor {
  id: string;
  userId: string | null;
  source: string | null;
  roles: string[];
  isAutoAttached: boolean;
  displayOrder: number;
}

export type StreamingLinkType = "SPOTIFY" | "APPLE_MUSIC" | "YOUTUBE";

export interface SongVersionLink {
  id: string;
  type: string;
  value: string;
  sourceUrl: string | null;
}

export interface SongVersionDetail extends SongVersionSummary {
  documentJson: SongDocument;
  contributors: VersionContributor[];
  identifiers: SongVersionLink[];
}

export interface CreateSongVersionInput {
  workId?: string;
  teamId?: string;
  title: string;
  language: string;
  alternateTitle?: string;
  copyright?: string;
  copyrightYear?: number;
  publisher?: string;
  ccli?: string;
}

export interface UpdateSongVersionInput {
  title?: string;
  alternateTitle?: string;
  language?: string;
  copyright?: string;
  copyrightYear?: number;
  publisher?: string;
  ccli?: string;
  key?: string;
  tempo?: number;
}

export interface WorkIdentifier {
  id: string;
  workId: string;
  type: string;
  value: string;
  sourceUrl: string | null;
  verifiedAt: string | null;
  note: string | null;
}

export interface WorkDetail {
  id: string;
  preferredOriginalVersionId: string | null;
  versions: Array<{
    id: string;
    title: string;
    language: string;
    ownerScope: string;
    publicationState: string;
    createdAt: string;
  }>;
  identifiers: WorkIdentifier[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Thin fetch wrapper shared by every SongVerse client (web now, React
 * Native later — see spec §5 "the web frontend and the React Native app
 * share only the packages/core layer"). Each app supplies its own
 * `getToken`; this client only knows how to attach it and parse JSON.
 */
export function createApiClient({ baseUrl, getToken }: ApiClientOptions) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    if (init?.body) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }
    // NestJS sends an empty body (Content-Length: 0) for a handler that
    // returns `null` or `undefined` — not the 4-byte JSON literal "null" —
    // and it does this on a plain 200, not just 204. `response.json()` on
    // an empty body throws ("Unexpected end of JSON input"), so check the
    // raw text first rather than trusting status code alone.
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  return {
    getMe: () => request<{ id: string; email: string; displayName: string }>("/users/me"),
    listTeams: () => request<Array<{ id: string; name: string; slug: string }>>("/teams"),
    createTeam: (data: { name: string; slug?: string; description?: string }) =>
      request<{ id: string; name: string; slug: string }>("/teams", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    listWorks: () => request<Array<{ id: string; title: string | null; createdAt: string }>>("/works"),
    getWork: (workId: string) => request<WorkDetail>(`/works/${workId}`),
    listSongVersions: () => request<SongVersionSummary[]>("/song-versions"),
    getSongVersion: (songVersionId: string) => request<SongVersionDetail>(`/song-versions/${songVersionId}`),
    createSongVersion: (data: CreateSongVersionInput) =>
      request<SongVersionSummary>("/song-versions", { method: "POST", body: JSON.stringify(data) }),
    updateSongVersion: (songVersionId: string, data: UpdateSongVersionInput) =>
      request<SongVersionDetail>(`/song-versions/${songVersionId}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteSongVersion: (songVersionId: string) =>
      request<void>(`/song-versions/${songVersionId}`, { method: "DELETE" }),
    importChordPro: (songVersionId: string, content: string) =>
      request<SongVersionDetail>(`/song-versions/${songVersionId}/chordpro`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    addContributor: (songVersionId: string, source: string, roles: string[]) =>
      request<VersionContributor>(`/song-versions/${songVersionId}/contributors`, {
        method: "POST",
        body: JSON.stringify({ source, roles }),
      }),
    removeContributor: (songVersionId: string, contributorId: string) =>
      request<void>(`/song-versions/${songVersionId}/contributors/${contributorId}`, { method: "DELETE" }),
    exportChordPro: (songVersionId: string) =>
      request<{ content: string }>(`/song-versions/${songVersionId}/chordpro`),
    setStreamingLink: (songVersionId: string, type: StreamingLinkType, url: string) =>
      request<SongVersionLink>(`/song-versions/${songVersionId}/links/${type}`, {
        method: "PUT",
        body: JSON.stringify({ url }),
      }),
    removeStreamingLink: (songVersionId: string, type: StreamingLinkType) =>
      request<void>(`/song-versions/${songVersionId}/links/${type}`, { method: "DELETE" }),
    listTagCategories: () => request<Array<{ id: string; slug: string; label: string }>>("/tags/categories"),
    listTags: () => request<Array<{ id: string; slug: string; label: string }>>("/tags"),

    searchMusicBrainzRecordings: (title: string, artist?: string) => {
      const params = new URLSearchParams({ title });
      if (artist) params.set("artist", artist);
      return request<MusicBrainzRecordingMatch[]>(`/musicbrainz/recordings/search?${params}`);
    },
    searchMusicBrainzWorks: (title: string) =>
      request<MusicBrainzWorkMatch[]>(`/musicbrainz/works/search?${new URLSearchParams({ title })}`),

    getSongVersionMusicBrainz: (songVersionId: string) =>
      request<MusicBrainzRecordingMatch | null>(`/song-versions/${songVersionId}/musicbrainz`),
    linkSongVersionMusicBrainz: (songVersionId: string, mbid: string) =>
      request<MusicBrainzRecordingMatch>(`/song-versions/${songVersionId}/musicbrainz-link`, {
        method: "POST",
        body: JSON.stringify({ mbid }),
      }),
    unlinkSongVersionMusicBrainz: (songVersionId: string) =>
      request<void>(`/song-versions/${songVersionId}/musicbrainz-link`, { method: "DELETE" }),

    getWorkMusicBrainz: (workId: string) => request<MusicBrainzWorkMatch | null>(`/works/${workId}/musicbrainz`),
    linkWorkMusicBrainz: (workId: string, mbid: string) =>
      request<MusicBrainzWorkMatch>(`/works/${workId}/musicbrainz-link`, {
        method: "POST",
        body: JSON.stringify({ mbid }),
      }),
    unlinkWorkMusicBrainz: (workId: string) =>
      request<void>(`/works/${workId}/musicbrainz-link`, { method: "DELETE" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
