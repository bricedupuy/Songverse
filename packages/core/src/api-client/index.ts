import type { MusicBrainzRecordingMatch, MusicBrainzWorkMatch } from "../schemas/musicbrainz.js";
import type { SongDocument } from "../schemas/song-document.js";

export interface ApiClientOptions {
  baseUrl: string;
  /** Resolves the current bearer token, or null when signed out. */
  getToken: () => Promise<string | null>;
}

export interface AdminCommandResult {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
}

export type TeamRole = "MEMBER" | "ADMIN";

export interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currentUserRole: TeamRole;
}

export interface TeamMember {
  userId: string;
  displayName: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}

export interface TeamInviteLink {
  id: string;
  token: string;
  role: TeamRole;
  createdAt: string;
  expiresAt: string | null;
  usedCount: number;
  maxUses: number | null;
}

export interface CreateInviteLinkInput {
  role?: TeamRole;
  expiresInDays?: number;
  maxUses?: number;
}

export type OwnershipScope = "GLOBAL" | "TEAM" | "USER";

export interface SongbookEntry {
  id: string;
  songVersionId: string;
  entryCode: string;
  songVersionTitle: string | null;
}

export interface SongbookSummary {
  id: string;
  name: string;
  abbreviation: string | null;
  language: string | null;
  publisher: string | null;
  year: number | null;
  ownerScope: OwnershipScope;
  ownerUserId: string | null;
  ownerTeamId: string | null;
}

export interface SongbookDetail extends SongbookSummary {
  entries: SongbookEntry[];
}

export interface CreateSongbookInput {
  name: string;
  abbreviation?: string;
  language?: string;
  publisher?: string;
  year?: number;
  teamId?: string;
  global?: boolean;
}

export interface UpdateSongbookInput {
  name?: string;
  abbreviation?: string;
  language?: string;
  publisher?: string;
  year?: number;
}

export interface SongbookCatalogEntry {
  id: string;
  entryCode: string;
  title: string;
  originalLanguage: string | null;
  composer: string | null;
  author: string | null;
  ccli: string | null;
}

export interface SongbookCatalogSummary {
  id: string;
  name: string;
  abbreviation: string | null;
  publisher: string | null;
  isbn: string | null;
  description: string | null;
  coverImageUrl: string | null;
  officialUrl: string | null;
  language: string | null;
  denomination: string | null;
  totalEntries: number | null;
  licensed: boolean;
}

export interface SongbookCatalogDetail extends SongbookCatalogSummary {
  entries: SongbookCatalogEntry[];
}

export interface CreateSongbookCatalogInput {
  name: string;
  abbreviation?: string;
  publisher?: string;
  isbn?: string;
  description?: string;
  coverImageUrl?: string;
  officialUrl?: string;
  language?: string;
  denomination?: string;
  totalEntries?: number;
  licensed?: boolean;
}

export type UpdateSongbookCatalogInput = Partial<CreateSongbookCatalogInput>;

export interface CreateSongbookCatalogEntryInput {
  entryCode: string;
  title: string;
  originalLanguage?: string;
  composer?: string;
  author?: string;
  ccli?: string;
}

export type UpdateSongbookCatalogEntryInput = Partial<CreateSongbookCatalogEntryInput>;

export interface ImportSongbookCatalogCsvResult {
  created: number;
  updated: number;
  errors: string[];
}

export interface ArtistSummary {
  id: string;
  userId: string | null;
  source: string | null;
}

export interface TagCategory {
  id: string;
  slug: string;
  label: string;
  translations: Record<string, string> | null;
  isGlobal: boolean;
}

export interface Tag {
  id: string;
  categoryId: string;
  slug: string;
  label: string;
  translations: Record<string, string> | null;
  scope: string;
  isApproved: boolean;
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
  artists: ArtistSummary[];
  tags: Tag[];
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
    getMe: () => request<{ id: string; email: string; displayName: string; locale: string }>("/users/me"),
    updateMe: (data: { locale?: string }) =>
      request<{ id: string; email: string; displayName: string; locale: string }>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    listTeams: () => request<TeamSummary[]>("/teams"),
    createTeam: (data: { name: string; slug?: string; description?: string }) =>
      request<TeamSummary>("/teams", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getTeam: (teamId: string) => request<TeamSummary>(`/teams/${teamId}`),
    joinTeamByToken: (token: string) => request<TeamSummary>(`/teams/join/${token}`, { method: "POST" }),
    listTeamMembers: (teamId: string) => request<TeamMember[]>(`/teams/${teamId}/members`),
    updateTeamMemberRole: (teamId: string, memberUserId: string, role: TeamRole) =>
      request<TeamMember>(`/teams/${teamId}/members/${memberUserId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    removeTeamMember: (teamId: string, memberUserId: string) =>
      request<void>(`/teams/${teamId}/members/${memberUserId}`, { method: "DELETE" }),
    leaveTeam: (teamId: string) => request<void>(`/teams/${teamId}/leave`, { method: "POST" }),
    listTeamInviteLinks: (teamId: string) => request<TeamInviteLink[]>(`/teams/${teamId}/invite-links`),
    createTeamInviteLink: (teamId: string, data: CreateInviteLinkInput) =>
      request<TeamInviteLink>(`/teams/${teamId}/invite-links`, { method: "POST", body: JSON.stringify(data) }),
    revokeTeamInviteLink: (teamId: string, linkId: string) =>
      request<void>(`/teams/${teamId}/invite-links/${linkId}`, { method: "DELETE" }),

    listSongbooks: () => request<SongbookSummary[]>("/songbooks"),
    createSongbook: (data: CreateSongbookInput) =>
      request<SongbookSummary>("/songbooks", { method: "POST", body: JSON.stringify(data) }),
    getSongbook: (songbookId: string) => request<SongbookDetail>(`/songbooks/${songbookId}`),
    updateSongbook: (songbookId: string, data: UpdateSongbookInput) =>
      request<SongbookSummary>(`/songbooks/${songbookId}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteSongbook: (songbookId: string) => request<void>(`/songbooks/${songbookId}`, { method: "DELETE" }),
    addSongbookEntry: (songbookId: string, songVersionId: string, entryCode: string) =>
      request<SongbookEntry>(`/songbooks/${songbookId}/entries`, {
        method: "POST",
        body: JSON.stringify({ songVersionId, entryCode }),
      }),
    removeSongbookEntry: (songbookId: string, entryId: string) =>
      request<void>(`/songbooks/${songbookId}/entries/${entryId}`, { method: "DELETE" }),

    listSongbookCatalogs: () => request<SongbookCatalogSummary[]>("/songbook-catalogs"),
    getSongbookCatalog: (catalogId: string) => request<SongbookCatalogDetail>(`/songbook-catalogs/${catalogId}`),
    createSongbookCatalog: (data: CreateSongbookCatalogInput) =>
      request<SongbookCatalogSummary>("/songbook-catalogs", { method: "POST", body: JSON.stringify(data) }),
    updateSongbookCatalog: (catalogId: string, data: UpdateSongbookCatalogInput) =>
      request<SongbookCatalogSummary>(`/songbook-catalogs/${catalogId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteSongbookCatalog: (catalogId: string) =>
      request<void>(`/songbook-catalogs/${catalogId}`, { method: "DELETE" }),
    addSongbookCatalogEntry: (catalogId: string, data: CreateSongbookCatalogEntryInput) =>
      request<SongbookCatalogEntry>(`/songbook-catalogs/${catalogId}/entries`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateSongbookCatalogEntry: (catalogId: string, entryId: string, data: UpdateSongbookCatalogEntryInput) =>
      request<SongbookCatalogEntry>(`/songbook-catalogs/${catalogId}/entries/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    removeSongbookCatalogEntry: (catalogId: string, entryId: string) =>
      request<void>(`/songbook-catalogs/${catalogId}/entries/${entryId}`, { method: "DELETE" }),
    importSongbookCatalogCsv: (catalogId: string, csv: string) =>
      request<ImportSongbookCatalogCsvResult>(`/songbook-catalogs/${catalogId}/entries/import-csv`, {
        method: "POST",
        body: JSON.stringify({ csv }),
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
    importSongText: (songVersionId: string, content: string, format: "CHORDPRO" | "CHORDS_OVER_LYRICS") =>
      request<SongVersionDetail>(`/song-versions/${songVersionId}/import`, {
        method: "POST",
        body: JSON.stringify({ content, format }),
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
    listTagCategories: () => request<TagCategory[]>("/tags/categories"),
    listTags: () => request<Tag[]>("/tags"),
    addSongVersionTag: (songVersionId: string, tagId: string) =>
      request<Tag>(`/song-versions/${songVersionId}/tags/${tagId}`, { method: "PUT" }),
    removeSongVersionTag: (songVersionId: string, tagId: string) =>
      request<void>(`/song-versions/${songVersionId}/tags/${tagId}`, { method: "DELETE" }),

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

    adminMigrationStatus: () => request<AdminCommandResult>("/admin/migrations/status"),
    adminRunSeed: () => request<AdminCommandResult>("/admin/seed", { method: "POST" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
