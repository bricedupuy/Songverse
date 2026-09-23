import type { InstrumentValue, TechRoleValue } from "../constants/index.js";
import type { BulkUploadFileMatch } from "../bulk-upload-matching/index.js";
import type { MusicBrainzRecordingMatch, MusicBrainzWorkMatch } from "../schemas/musicbrainz.js";
import type { SongDocument } from "../schemas/song-document.js";
import type { SongbookSection } from "../songbook-sections/index.js";

export interface ApiClientOptions {
  baseUrl: string;
  /** Resolves the current bearer token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Called when the API answers 401, e.g. so a cached token isn't reused. */
  onUnauthorized?: () => void;
}

export interface AdminCommandResult {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  isGlobalAdmin: boolean;
  createdAt: string;
  bannedAt: string | null;
  banReason: string | null;
  /** Set while the account awaits a content transfer. */
  deletedAt: string | null;
  transferExpiresAt: string | null;
  /** Per-user override; null uses the default limit. */
  storageLimitMb: number | null;
  usedBytes: number;
  /** Null means unlimited (global admins). */
  limitBytes: number | null;
  teamCount: number;
  songCount: number;
}

export interface UpdateUserByAdminInput {
  storageLimitMb?: number | null;
  banned?: boolean;
  banReason?: string;
}

export interface TransferLink {
  transferUrl: string;
  expiresAt: string;
}

export interface TransferPreview {
  fromDisplayName: string;
  expiresAt: string;
  songCount: number;
  arrangementCount: number;
  songbookCount: number;
  tagCount: number;
  setCount: number;
  storageBytes: number;
}

export interface StorageLimits {
  defaultLimitMb: number;
  isBuiltIn: boolean;
  builtInDefaultMb: number;
}

export interface StorageUsage {
  usedBytes: number;
  /** Null means unlimited. */
  limitBytes: number | null;
}

export interface SetlistSongRef {
  id: string;
  title: string;
  workId: string;
  /** The song's own key as written on it, if any. */
  key: string | null;
  ownerScope: "GLOBAL" | "TEAM" | "USER";
  teamName: string | null;
}

export interface SetlistSummary {
  id: string;
  /** Null when the set is shown by its date (or as untitled). */
  name: string | null;
  /** YYYY-MM-DD */
  eventDate: string | null;
  /** Null for a personal set. */
  teamId: string | null;
  teamName: string | null;
  itemCount: number;
  canEdit: boolean;
}

export interface SetlistItem {
  id: string;
  position: number;
  /** Semitones relative to the song's own key. */
  transposeSteps: number;
  notes: string | null;
  /** Null when the song isn't visible to the current user. */
  song: SetlistSongRef | null;
  /** Versions of the same song this item can switch to (editors only). */
  versions: SetlistSongRef[];
}

export interface SetlistDetail extends SetlistSummary {
  items: SetlistItem[];
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  isGlobalAdmin: boolean;
  instruments: InstrumentValue[];
  techRoles: TechRoleValue[];
}

export type StorageConfigSource = "database" | "env" | "none";

export interface AdminStorageStats {
  driver: "s3" | "local";
  source: StorageConfigSource;
  attachmentCount: number;
  totalBytes: number;
  byType: Record<string, number>;
}

export interface StorageConfigSummary {
  source: StorageConfigSource;
  driver: "s3" | "local";
  hasDatabaseConfig: boolean;
  accountId: string | null;
  accessKeyIdMasked: string | null;
  bucket: string | null;
  endpoint: string | null;
}

export interface SaveStorageConfigInput {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
  endpoint?: string;
}

export type AuthConfigSource = "database" | "env" | "none";

export interface AuthConfigSummary {
  emailSource: AuthConfigSource;
  emailFrom: string;
  hasDatabaseResendKey: boolean;
  googleSource: AuthConfigSource;
  googleClientId: string | null;
  hasDatabaseGoogleSecret: boolean;
}

export interface SaveAuthConfigInput {
  resendApiKey?: string;
  emailFrom?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

export interface AuthPublicConfig {
  hasGoogleAuth: boolean;
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
  avatarUrl: string | null;
  role: TeamRole;
  joinedAt: string;
  instruments: InstrumentValue[];
  techRoles: TechRoleValue[];
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

export type SongbookKind = "SIMPLE" | "NUMBERED";

export interface SongbookEntry {
  id: string;
  songVersionId: string;
  entryCode: string | null;
  songVersionTitle: string | null;
  sectionLabel: string | null;
}

export interface SongbookSummary {
  id: string;
  name: string;
  abbreviation: string | null;
  language: string | null;
  publisher: string | null;
  year: number | null;
  kind: SongbookKind;
  sections: SongbookSection[] | null;
  ownerScope: OwnershipScope;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  sourceCatalogId?: string | null;
}

export interface PendingSongbookEntry {
  catalogEntryId: string;
  entryCode: string;
  title: string;
}

export interface SongbookDetail extends SongbookSummary {
  entries: SongbookEntry[];
  pendingEntries?: PendingSongbookEntry[];
}

export interface CreateSongbookInput {
  name: string;
  kind: SongbookKind;
  abbreviation?: string;
  language?: string;
  publisher?: string;
  year?: number;
  teamId?: string;
  global?: boolean;
}

export interface ImportSongbookFromCatalogInput {
  catalogId: string;
  teamId?: string;
  global?: boolean;
}

export type BulkUploadContentType = "CHORDPRO" | "PDF";

export interface BulkUploadCommitResult {
  queued: number;
  skipped: string[];
}

export interface UpdateSongbookInput {
  name?: string;
  abbreviation?: string;
  language?: string;
  publisher?: string;
  year?: number;
  sections?: SongbookSection[];
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

export type AttachmentType = "PDF" | "CHORDPRO" | "MUSICXML" | "ABC_NOTATION" | "TEXT" | "IMAGE";

export interface Attachment {
  id: string;
  songVersionId: string;
  type: AttachmentType;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
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
  ownerUserId: string | null;
  ownerTeamId: string | null;
  publicationState: string;
  ccli: string | null;
  createdAt: string;
  updatedAt: string;
  artists: ArtistSummary[];
  tags: Tag[];
}

export interface SongVersionSongbookMembership {
  songbookId: string;
  songbookName: string;
  entryCode: string | null;
  sectionLabel: string | null;
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

/**
 * `message` is the API's human-readable message when the body is a NestJS
 * error ({ message, code? }), otherwise the raw body; `code` is the
 * machine-readable one, when the API sent one (e.g. STORAGE_LIMIT_EXCEEDED).
 */
export class ApiError extends Error {
  readonly code?: string;

  constructor(
    public readonly status: number,
    body: string,
  ) {
    const parsed = parseErrorBody(body);
    super(parsed.message ?? body);
    this.name = "ApiError";
    this.code = parsed.code;
  }
}

function parseErrorBody(body: string): { message?: string; code?: string } {
  try {
    const json = JSON.parse(body) as { message?: unknown; code?: unknown };
    const message = Array.isArray(json.message) ? json.message.join(", ") : json.message;
    return {
      message: typeof message === "string" ? message : undefined,
      code: typeof json.code === "string" ? json.code : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Thin fetch wrapper shared by every SongVerse client (web now, React
 * Native later — see spec §5 "the web frontend and the React Native app
 * share only the packages/core layer"). Each app supplies its own
 * `getToken`; this client only knows how to attach it and parse JSON.
 */
export function createApiClient({ baseUrl, getToken, onUnauthorized }: ApiClientOptions) {
  async function failed(response: Response): Promise<ApiError> {
    if (response.status === 401) onUnauthorized?.();
    return new ApiError(response.status, await response.text());
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    // A FormData body (attachment upload) must NOT get an explicit
    // Content-Type - the browser sets one itself, including the
    // multipart boundary, only when it's left unset.
    if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw await failed(response);
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
    getMe: () => request<UserProfile>("/users/me"),
    /** Omitted fields are left as they are; `instruments`/`techRoles` replace the whole list. */
    updateMe: (data: { locale?: string; displayName?: string; instruments?: InstrumentValue[]; techRoles?: TechRoleValue[] }) =>
      request<UserProfile>("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
    getMyStorage: () => request<StorageUsage>("/users/me/storage"),
    uploadAvatar: (file: Blob, filename = "avatar") => {
      const form = new FormData();
      form.append("file", file, filename);
      return request<UserProfile>("/users/me/avatar", { method: "PUT", body: form });
    },
    removeAvatar: () => request<UserProfile>("/users/me/avatar", { method: "DELETE" }),
    getTransfer: (token: string) => request<TransferPreview>(`/transfers/${encodeURIComponent(token)}`),
    claimTransfer: (token: string) =>
      request<void>(`/transfers/${encodeURIComponent(token)}/claim`, { method: "POST" }),
    listTeams: () => request<TeamSummary[]>("/teams"),
    createTeam: (data: { name: string; slug?: string; description?: string }) =>
      request<TeamSummary>("/teams", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getTeam: (teamId: string) => request<TeamSummary>(`/teams/${teamId}`),
    deleteTeam: (teamId: string) => request<void>(`/teams/${teamId}`, { method: "DELETE" }),
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
    importSongbookFromCatalog: (data: ImportSongbookFromCatalogInput) =>
      request<SongbookSummary>("/songbooks/import-from-catalog", { method: "POST", body: JSON.stringify(data) }),
    materializeSongbookCatalogEntry: (songbookId: string, catalogEntryId: string) =>
      request<SongbookEntry>(`/songbooks/${songbookId}/catalog-entries/${catalogEntryId}/materialize`, {
        method: "POST",
      }),
    addSongbookEntry: (songbookId: string, songVersionId: string, entryCode?: string) =>
      request<SongbookEntry>(`/songbooks/${songbookId}/entries`, {
        method: "POST",
        body: JSON.stringify({ songVersionId, entryCode }),
      }),
    previewBulkUpload: (songbookId: string, filenames: string[]) =>
      request<BulkUploadFileMatch[]>(`/songbooks/${songbookId}/bulk-upload/preview`, {
        method: "POST",
        body: JSON.stringify({ filenames }),
      }),
    commitBulkUpload: (songbookId: string, type: BulkUploadContentType, files: File[]) => {
      const form = new FormData();
      form.append("type", type);
      for (const file of files) form.append("files", file);
      return request<BulkUploadCommitResult>(`/songbooks/${songbookId}/bulk-upload`, {
        method: "POST",
        body: form,
      });
    },
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
    getSongVersionSongbooks: (songVersionId: string) =>
      request<SongVersionSongbookMembership[]>(`/song-versions/${songVersionId}/songbooks`),
    listAttachments: (songVersionId: string) => request<Attachment[]>(`/song-versions/${songVersionId}/attachments`),
    uploadAttachment: (songVersionId: string, type: AttachmentType, file: File) => {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file);
      return request<Attachment>(`/song-versions/${songVersionId}/attachments`, { method: "POST", body: form });
    },
    deleteAttachment: (songVersionId: string, attachmentId: string) =>
      request<void>(`/song-versions/${songVersionId}/attachments/${attachmentId}`, { method: "DELETE" }),
    downloadAttachment: async (songVersionId: string, attachmentId: string): Promise<Blob> => {
      const token = await getToken();
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(
        `${baseUrl}/song-versions/${songVersionId}/attachments/${attachmentId}/download`,
        { headers },
      );
      if (!response.ok) throw await failed(response);
      return response.blob();
    },
    /**
     * A resized WebP rendition of an image attachment. `width` snaps up to
     * one of 32-2048 on the server, and images are never enlarged.
     */
    getAttachmentImage: async (songVersionId: string, attachmentId: string, width: number): Promise<Blob> => {
      const token = await getToken();
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(
        `${baseUrl}/song-versions/${songVersionId}/attachments/${attachmentId}/image?w=${width}`,
        { headers },
      );
      if (!response.ok) throw await failed(response);
      return response.blob();
    },
    listSetlists: () => request<SetlistSummary[]>("/setlists"),
    createSetlist: (data: { name?: string; eventDate?: string; teamId?: string }) =>
      request<SetlistSummary>("/setlists", { method: "POST", body: JSON.stringify(data) }),
    getSetlist: (setlistId: string) => request<SetlistDetail>(`/setlists/${setlistId}`),
    updateSetlist: (setlistId: string, data: { name?: string | null; eventDate?: string | null }) =>
      request<SetlistDetail>(`/setlists/${setlistId}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteSetlist: (setlistId: string) => request<void>(`/setlists/${setlistId}`, { method: "DELETE" }),
    searchSetlistSongs: (setlistId: string, query: string) =>
      request<SetlistSongRef[]>(`/setlists/${setlistId}/song-candidates?q=${encodeURIComponent(query)}`),
    addSetlistItem: (setlistId: string, data: { songVersionId: string; transposeSteps?: number }) =>
      request<SetlistDetail>(`/setlists/${setlistId}/items`, { method: "POST", body: JSON.stringify(data) }),
    updateSetlistItem: (
      setlistId: string,
      itemId: string,
      data: { songVersionId?: string; transposeSteps?: number; notes?: string | null },
    ) => request<SetlistDetail>(`/setlists/${setlistId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(data) }),
    removeSetlistItem: (setlistId: string, itemId: string) =>
      request<SetlistDetail>(`/setlists/${setlistId}/items/${itemId}`, { method: "DELETE" }),
    reorderSetlistItems: (setlistId: string, itemIds: string[]) =>
      request<SetlistDetail>(`/setlists/${setlistId}/items/order`, { method: "PUT", body: JSON.stringify({ itemIds }) }),
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
    adminListUsers: () => request<AdminUserSummary[]>("/admin/users"),
    adminUpdateUser: (userId: string, data: UpdateUserByAdminInput) =>
      request<void>(`/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(data) }),
    /** Resolves to the transfer link for contentAction "transfer", otherwise undefined. */
    adminDeleteUser: (userId: string, data: { contentAction: "delete" | "transfer"; retentionDays?: number }) =>
      request<TransferLink | undefined>(`/admin/users/${userId}/delete`, { method: "POST", body: JSON.stringify(data) }),
    adminRegenerateTransferLink: (userId: string) =>
      request<TransferLink>(`/admin/users/${userId}/transfer-link`, { method: "POST" }),
    adminGetStorageLimits: () => request<StorageLimits>("/admin/storage/limits"),
    adminSaveStorageLimits: (defaultLimitMb: number | null) =>
      request<void>("/admin/storage/limits", { method: "PUT", body: JSON.stringify({ defaultLimitMb }) }),
    adminStorageStats: () => request<AdminStorageStats>("/admin/storage"),
    adminGetStorageConfig: () => request<StorageConfigSummary>("/admin/storage/config"),
    adminSaveStorageConfig: (data: SaveStorageConfigInput) =>
      request<void>("/admin/storage/config", { method: "PUT", body: JSON.stringify(data) }),
    adminClearStorageConfig: () => request<void>("/admin/storage/config", { method: "DELETE" }),

    getAuthPublicConfig: () => request<AuthPublicConfig>("/auth/public-config"),
    adminGetAuthConfig: () => request<AuthConfigSummary>("/admin/auth"),
    adminSaveAuthConfig: (data: SaveAuthConfigInput) =>
      request<void>("/admin/auth", { method: "PUT", body: JSON.stringify(data) }),
    adminClearAuthEmailConfig: () => request<void>("/admin/auth/email", { method: "DELETE" }),
    adminClearAuthGoogleConfig: () => request<void>("/admin/auth/google", { method: "DELETE" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
