import type {
  CapoDisplayModeValue,
  ChordNotationValue,
  InstrumentValue,
  SupportedImportFormat,
  TechRoleValue,
} from "../constants/index.js";
import type { ArrangementDocumentV2, ChartPreferences } from "../schemas/arrangement-document-v2.js";
import type { CatalogEntryData, CatalogEntryFieldKey, CatalogFileProblem } from "../songbook-catalog-format/index.js";
import type { BulkUploadFileMatch } from "../bulk-upload-matching/index.js";
import type { MetadataCapability, MetadataMatch, MetadataProviderKey } from "../schemas/metadata.js";
import type { MusicBrainzWorkMatch } from "../schemas/musicbrainz.js";
import type { SectionInstance, SectionV2, SongDocumentV2 } from "../schemas/song-document-v2.js";
import type { SongbookSection } from "../songbook-sections/index.js";
import type { StemPart } from "../stems/index.js";
import type { SongChange, SongSnapshot } from "../song-history/index.js";

export interface ApiClientOptions {
  baseUrl: string;
  /** Resolves the current bearer token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Called when the API answers 401, e.g. so a cached token isn't reused. */
  onUnauthorized?: () => void;
  /** Called after any request that changes something succeeds, e.g. so cached reads are refetched. */
  onChange?: () => void;
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
  isReviewer: boolean;
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
  isReviewer?: boolean;
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
  /** Tells this version apart from the song's others, e.g. "Acoustic". */
  versionName: string | null;
  workId: string;
  /** The song's own key as written on it, if any. */
  key: string | null;
  ownerScope: "GLOBAL" | "TEAM" | "USER";
  teamName: string | null;
  /** Its artists' names (issue #68); missing from copies kept offline before then. */
  artists?: string[];
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
  /** Whose personal set it is; null for a team set. */
  ownerName: string | null;
  itemCount: number;
  canEdit: boolean;
  /** Shared with the current user by link, rather than theirs or their team's. */
  isGuest: boolean;
}

export interface SetlistItem {
  id: string;
  position: number;
  /** Semitones relative to the song's own key. */
  transposeSteps: number;
  notes: string | null;
  /** Null when the song isn't readable by the current user (shown as a placeholder). */
  song: SetlistSongRef | null;
  /** Also in the current user's own library, i.e. openable outside the set. */
  inLibrary: boolean;
  /** Someone's personal song shared into this (team) set by them, read-only. */
  sharedBy: { id: string; displayName: string } | null;
  /** The set's team has asked for this song; `canDecide` when it's the current user's. */
  ownershipRequest: { id: string; canDecide: boolean } | null;
  /** A team admin can ask for this shared song (or, owning it, hand it over). */
  canRequestOwnership: boolean;
  /** Where the song is in the viewer's numbered songbooks: "JEM 855 · JEM3" (issue #55). */
  songbookReferences: string[];
  /** Versions of the same song this item can switch to (editors only). */
  versions: SetlistSongRef[];
  /** The arrangement it's played in (and the semitones it moves the song's key); null plays the song as written. */
  arrangement: { id: string; name: string; transposeSteps: number; setOnly: boolean } | null;
  /** The arrangements this set could play for it (editors only); `setOnly` is its own for this set. */
  arrangements: { id: string; name: string; isTeamDefault: boolean; setOnly: boolean }[];
}

export interface SetlistDetail extends SetlistSummary {
  items: SetlistItem[];
}

/** One song of a set, as anyone who can open the set sees it. */
export interface SetlistSongView {
  set: SetlistSummary;
  item: { id: string; position: number; transposeSteps: number; notes: string | null; arrangementId: string | null };
  song:
    | (SetlistSongRef & {
        tempo: number | null;
        sections: SectionV2[];
        flow: SectionInstance[];
        /** The whole document, for renderChart(). */
        document: SongDocumentV2;
        /** A capo written on the song: a suggestion when the arrangement sets none. */
        suggestedCapo: number | null;
      })
    | null;
  /** The arrangement the set plays it in (null: as written). */
  arrangement: { id: string; name: string; document: ArrangementDocumentV2 } | null;
  /** How the current user reads it. */
  view: ChartViewSettings;
  inLibrary: boolean;
  sharedBy: { id: string; displayName: string } | null;
  previousItemId: string | null;
  nextItemId: string | null;
  /** Where the song is in the viewer's numbered songbooks: "JEM 855 · JEM3" (issue #59). */
  songbookReferences: string[];
  /** The next song's title; null at the end of the set, or when the viewer can't read that song. */
  nextTitle: string | null;
  /** The current user's private note on this song of the set. */
  myNote: string;
}

/** A set to keep offline (GET /setlists/:id/offline): the set, and each of its songs as the song view gives it. */
export interface SetlistOfflineCopy {
  set: SetlistDetail;
  songs: SetlistSongView[];
  /** Changes whenever anything in the copy would. */
  version: string;
}

/** A song to keep offline (issue #52): its details, its files' list, and a version. */
export interface SongOfflineCopy {
  song: SongVersionDetail;
  attachments: Attachment[];
  version: string;
}

/** A songbook to keep offline (issue #52): its entries, and a version. */
export interface SongbookOfflineCopy {
  songbook: SongbookDetail;
  version: string;
}

/** A songbook entry found by reference ("HY 42"), for search (issue #48). */
export interface SongbookEntryHit {
  songbookId: string;
  songbookName: string;
  abbreviation: string | null;
  entryCode: string;
  /** The printed volume, when the songbook has sections. */
  sectionLabel: string | null;
  songVersionId: string;
  title: string;
}

export type OfflinePinKind = "SET" | "SONG" | "SONGBOOK";

/** Something the user keeps offline on every device ("Available offline", "Keep a local copy"). */
export interface OfflinePin {
  kind: OfflinePinKind;
  targetId: string;
  includeAudio: boolean;
  createdAt: string;
}

/** POST /offline/sync (issues #51, #52): what a device should keep offline now. */
export interface OfflineSyncResponse {
  days: number;
  /** The sets dated from yesterday to `days` ahead. */
  upcoming: string[];
  /** Upcoming, pinned and known sets still visible; `copy` only when the device's version is out of date. */
  sets: { id: string; version: string; copy?: SetlistOfflineCopy }[];
  /** Known sets deleted, or no longer visible: remove them. */
  gone: string[];
  /** Pinned songbooks. */
  songbooks: { id: string; version: string; copy?: SongbookOfflineCopy }[];
  goneSongbooks: string[];
  /** The user's own songs, pinned ones, and those in kept sets and songbooks; `audio`: download their audio files too. */
  songs: { id: string; version: string; audio: boolean; copy?: SongOfflineCopy }[];
  goneSongs: string[];
  pins: OfflinePin[];
  /** The user's chord settings, for songs shown on their own. */
  viewer: { chordNotation: ChordNotationValue; capoDisplayMode: CapoDisplayModeValue };
}

/** A player's own way of reading charts: this chart's preferences, and their settings for every chart. */
export interface ChartViewSettings {
  preferences: ChartPreferences | null;
  chordNotation: ChordNotationValue;
  capoDisplayMode: CapoDisplayModeValue;
}

/** An arrangement of a song, as listed (docs/arrangement-document-v2.md). */
export interface ArrangementSummary {
  id: string;
  songVersionId: string;
  name: string;
  description: string | null;
  ownerScope: "USER" | "TEAM" | "GLOBAL";
  teamId: string | null;
  teamName: string | null;
  ownerName: string | null;
  isTeamDefault: boolean;
  /** Set when it's one song's own arrangement for one set: that set's id. */
  setlistId: string | null;
  /** The key it's played in, when the song has one. */
  key: string | null;
  transposeSteps: number;
  capo: number | null;
  /** The song changed since the arrangement was last checked against it. */
  needsReview: boolean;
  canEdit: boolean;
  updatedAt: string;
}

export interface ArrangementDetail extends ArrangementSummary {
  document: ArrangementDocumentV2;
  song: { revision: number; key: string | null };
  /** References to the song that no longer match (deleted lines or chords). */
  problems: string[];
}

export interface SetlistGuest {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  joinedAt: string;
}

export interface SetlistSharing {
  link: { token: string; createdAt: string } | null;
  guests: SetlistGuest[];
}

export interface SetInvitePreview {
  name: string | null;
  eventDate: string | null;
  teamName: string | null;
  ownerName: string | null;
  itemCount: number;
}

export interface SongOwnershipRequest {
  id: string;
  createdAt: string;
  song: { id: string; title: string };
  team: { id: string; name: string };
  requestedByName: string | null;
  setlistId: string | null;
  /** When false, handing the song over means losing access to it. */
  ownerIsTeamMember: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  isGlobalAdmin: boolean;
  isReviewer: boolean;
  instruments: InstrumentValue[];
  techRoles: TechRoleValue[];
  /** With a capo: chords as they sound, or the shapes a guitarist plays. */
  capoDisplayMode: CapoDisplayModeValue;
  /** Chord names in letters or solfège. */
  chordNotation: ChordNotationValue;
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
  /** Imported from a catalogue whose printed volumes differ from the songbook's: offered to use (issue #55). */
  catalogSections?: SongbookSection[] | null;
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

/** Every field of the catalogue file format (see songbook-catalog-format), plus where "Original song" points. */
export interface SongbookCatalogEntry extends CatalogEntryData {
  id: string;
  /** The entry `originalSong` refers to ("JEM 245"), when it exists in Songverse. */
  original: {
    catalogId: string;
    catalogName: string;
    catalogAbbreviation: string | null;
    entryId: string;
    entryCode: string;
    title: string;
  } | null;
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
  /** The printed volumes' number ranges ("JEM1": 1-371...), copied into imported songbooks (issue #55). */
  sections: SongbookSection[] | null;
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

export type UpdateSongbookCatalogInput = Partial<CreateSongbookCatalogInput> & { sections?: SongbookSection[] };

/** Any fields of an entry; null or "" clears, a field left out is left alone. */
export type SongbookCatalogEntryInput = { [K in keyof CatalogEntryData]?: CatalogEntryData[K] | null };

export interface SongbookCatalogImportResult {
  format: "csv" | "json";
  dryRun: boolean;
  /** False when nothing was saved: a dry run, or replace mode with problems in the file. */
  applied: boolean;
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
  problems: CatalogFileProblem[];
  unknownColumns: string[];
  /** The first 500 changes. */
  changes: { entryCode: string; kind: "create" | "update" | "delete"; fields: CatalogEntryFieldKey[] }[];
}

export type AttachmentType = "PDF" | "CHORDPRO" | "MUSICXML" | "ABC_NOTATION" | "TEXT" | "IMAGE" | "AUDIO" | "OTHER";

export interface Attachment {
  id: string;
  songVersionId: string;
  type: AttachmentType;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  /** For audio: the part of the song it is (a stem), or null for a full mix. */
  stemPart: StemPart | null;
  /** For audio: the recording's key and tempo (BPM) when they aren't the song's, else null. */
  recordingKey: string | null;
  recordingTempo: number | null;
  /** Who sees it besides its uploader (issue #72): nobody, a team, or everyone who sees the song. */
  visibility: AttachmentVisibility;
  visibleToTeamId: string | null;
  visibleToTeam: { id: string; name: string } | null;
  uploadedByUserId: string | null;
  uploadedBy: { id: string; displayName: string } | null;
  /** The viewer may change its part, key and tempo, or remove it. */
  canChange: boolean;
  /** The viewer may change who sees it. */
  canChangeVisibility: boolean;
  createdAt: string;
}

export type AttachmentVisibility = "PRIVATE" | "TEAM" | "SONG" | "SHARED";

/** Who sees a file: `teamId` for TEAM. */
export interface AttachmentAudience {
  visibility: AttachmentVisibility;
  teamId?: string | null;
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
  /** Tells this version apart from the song's others, e.g. "Acoustic". */
  versionName: string | null;
  language: string;
  ownerScope: "GLOBAL" | "TEAM" | "USER";
  ownerUserId: string | null;
  ownerTeamId: string | null;
  publicationState: string;
  ccli: string | null;
  /** Who put it in the catalogue (issue #73): a person, and the team whose song it was. */
  contributedBy: { id: string; displayName: string } | null;
  contributedByTeam: { id: string; name: string } | null;
  /** Shared with the viewer by its owner (issue #77): who by, and whether to edit. */
  sharedBy?: SharedBy | null;
  /** Its image (issue #85), at an address signed for the viewer that works for a day or two; add `&w=` for a width. */
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  artists: ArtistSummary[];
  tags: Tag[];
}

export type SongSort = "title" | "updatedAt" | "createdAt" | "language" | "publicationState";

export interface ListSongVersionsQuery {
  /** Matches title, subtitle, version name or artist (ignoring case), or a CCLI number exactly. */
  q?: string;
  /** Only the user's favorites (issue #81). */
  favorites?: boolean;
  language?: string;
  tagId?: string;
  /** Only this artist's songs: the whole name, ignoring case and accents. */
  artist?: string;
  /** Defaults to updatedAt. */
  sort?: SongSort;
  /** Defaults to desc for dates, asc otherwise. */
  dir?: "asc" | "desc";
  /** 1-based. */
  page?: number;
  /** Up to 200; defaults to 50. */
  pageSize?: number;
}

/** What a smart list (issue #58) filters the library by: the library's own search. */
export interface SmartListFilters {
  q?: string;
  language?: string;
  tagId?: string;
  artist?: string;
  sort?: SongSort;
  dir?: "asc" | "desc";
}

/** A saved library filter, the user's own. */
export interface SmartList {
  id: string;
  name: string;
  filters: SmartListFilters;
  createdAt: string;
  updatedAt: string;
}

/** An artist credited on songs the user can see. */
export interface ArtistCount {
  name: string;
  songCount: number;
  /** Their picture (issue #86), signed for the viewer; null when there's none. */
  imageUrl: string | null;
}

/** An artist's page (issue #86). */
export interface ArtistDetail {
  id: string | null;
  name: string;
  /** Songs by them you can see. */
  songCount: number;
  imageUrl: string | null;
  /** "deezer", "upload", or null. */
  imageSource: string | null;
  /** The picture's source page (Deezer's), to credit it. */
  imageSourceUrl: string | null;
  /** One per language (en, fr): show the reader's. */
  bios: { text: string; language: string; sourceUrl: string | null; custom: boolean }[];
  /** Whether the providers have been asked yet. */
  lookedUp: boolean;
  lookupsEnabled: boolean;
  /** Global admins edit artists: they're the same for everyone. */
  canEdit: boolean;
}

export interface ArtistSettings {
  enabled: boolean;
  source: "database" | "env" | "default";
}

/** One page of songs, with the total across all pages. */
/** One of Apple Music's matches for a song's artwork (issue #85). */
export interface ArtworkCandidate {
  /** Who it's from (issue #89). */
  provider?: MetadataProviderKey;
  title: string;
  artist: string;
  album: string | null;
  releaseDate?: string | null;
  artworkUrl: string;
  thumbnailUrl: string;
}

/** Auto detect's results (issue #22), and the providers that didn't answer. */
export interface MetadataSearchResult {
  matches: MetadataMatch[];
  unavailable: MetadataProviderKey[];
}

export interface MetadataSettings {
  /** Every provider, in the order they're asked (issue #89). */
  providers: {
    key: MetadataProviderKey;
    name: string;
    /** What it's asked for. */
    capabilities: Record<MetadataCapability, boolean>;
    /** What it can do. */
    supports: MetadataCapability[];
    /** What it can do with the keys it has now. */
    ready: Record<MetadataCapability, boolean>;
  }[];
  source: "database" | "env" | "default";
  /** The Apple Music API's MusicKit key (issue #87): never the private key, only whether the database has one. */
  appleMusic: {
    source: "database" | "env" | "tokenUrl" | "none";
    teamId: string | null;
    keyId: string | null;
    hasDatabasePrivateKey: boolean;
    /** A developer token address, used while there's no key (a stopgap). */
    tokenUrl: string | null;
    tokenUrlSource: "database" | "env" | "none";
    /** The storefront searched (kept with Song artwork's settings). */
    country: string;
  };
  /** Spotify's developer app (issue #89): never the secret, only whether the database has one. */
  spotify: { source: "database" | "env" | "none"; clientId: string | null; hasDatabaseSecret: boolean; market: string; marketSource: "database" | "env" | "default" };
  musicbrainz: { contact: string; source: "database" | "env" | "default" };
}

export interface ArtworkSettings {
  enabled: boolean;
  country: string;
  source: "database" | "default";
}

/** Where a song is in a list (issue #84): the ones before and after it; null position when it isn't in it. */
export interface SongNeighbors {
  position: number | null;
  total: number;
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
}

/** The Library's home (issue #81): its shelves, each up to 12 songs. */
export interface LibraryHome {
  newest: SongVersionSummary[];
  recent: SongVersionSummary[];
  favorites: SongVersionSummary[];
  popular: SongVersionSummary[];
}

export interface SongPage {
  items: SongVersionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SongVersionSongbookMembership {
  songbookId: string;
  songbookName: string;
  abbreviation: string | null;
  entryCode: string | null;
  /** The printed volume the number falls in (the songbook's sections). */
  sectionLabel: string | null;
  /** To give someone without the app: "JEM 855 · JEM3" (issue #55). */
  reference: string;
}

export interface VersionContributor {
  id: string;
  userId: string | null;
  source: string | null;
  roles: string[];
  isAutoAttached: boolean;
  displayOrder: number;
}

/** One step in a song's history (issue #71), newest first in a list. */
export interface SongRevisionEntry {
  id: string;
  /** EDITED; CREATED; RESTORED (`restoredFrom` it); BASELINE: the song as it was before its history was kept. */
  kind: "CREATED" | "EDITED" | "RESTORED" | "BASELINE";
  createdAt: string;
  /** When its last save landed: saves by the same person a few minutes apart are one entry. */
  updatedAt: string;
  /** Null once they're deleted, or for BASELINE. */
  author: { id: string; displayName: string } | null;
  changes: SongChange[];
  restoredFrom: { id: string; updatedAt: string } | null;
}

/** An entry with the song as it left it, and as the entry before left it (null for the first). */
export interface SongRevisionDetail extends SongRevisionEntry {
  snapshot: SongSnapshot;
  previous: SongSnapshot | null;
}

/** A suggested change to a catalogue song (issue #74). */
export interface Suggestion {
  id: string;
  state: "OPEN" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "PARTIALLY_APPLIED" | "WITHDRAWN";
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  /** What it changes and why, for the reviewer. */
  description: string | null;
  reviewNotes: string | null;
  proposer: { id: string; displayName: string };
  reviewer: { id: string; displayName: string } | null;
  song: { id: string; title: string; versionName: string | null; ownerScope: string };
  changes: SongChange[];
}

/** A suggestion with the song as it was when it was made and as it would leave it; `conflicts` are the parts changed since in the same place. */
export interface SuggestionDetail extends Suggestion {
  base: SongSnapshot;
  proposed: SongSnapshot;
  conflicts: string[];
}

/** Who shared a song with you (issue #77), and whether to edit. */
export interface SharedBy {
  id: string;
  displayName: string;
  canEdit: boolean;
}

/** Someone in Songverse (People, issue #77). */
export interface Person {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PeopleOverview {
  people: (Person & { connectionId: string; email: string })[];
  /** Asking to connect with you. */
  incoming: { id: string; createdAt: string; from: Person & { email: string } }[];
  /** You asked, and they haven't said yes yet. */
  outgoing: { id: string; createdAt: string; email: string }[];
  /** People from your teams you're not connected to. */
  suggestions: Person[];
}

export interface SongShare {
  user: Person;
  canEdit: boolean;
}

export type StreamingLinkType = "SPOTIFY" | "APPLE_MUSIC" | "DEEZER" | "YOUTUBE";

export interface SongVersionLink {
  id: string;
  type: string;
  value: string;
  sourceUrl: string | null;
}

export interface SongVersionDetail extends SongVersionSummary {
  sortTitle: string | null;
  album: string | null;
  /** Written or published; separate from copyrightYear. */
  year: number | null;
  copyright: string | null;
  copyrightYear: number | null;
  publisher: string | null;
  /** Compact: USRC17607839. */
  isrc: string | null;
  /** E.g. the scripture a song draws on. */
  reference: string | null;
  notes: string | null;
  relationshipType: string | null;
  /** The version this one derives from, e.g. the original of a translation. */
  parentVersion: { id: string; title: string; language: string } | null;
  /** The music (SongDocument v2); key, tempo, time signature and duration are in `documentJson.defaults`. */
  documentJson: SongDocumentV2;
  /** Capo fret; moves to arrangements once they exist. */
  capo: number | null;
  contributors: VersionContributor[];
  identifiers: SongVersionLink[];
  /** Whether the current user may change its chart, details and credits. */
  canEdit: boolean;
  /** Whether they may delete, publish or share it, or change its links and everyone's files (#77). */
  canManage: boolean;
  /** In the user's favorites (issue #81). */
  isFavorite?: boolean;
}

/** A song's optional fields. A field left out is left alone; null clears it. */
export interface SongFieldsInput {
  /** Shown as "Subtitle". */
  alternateTitle?: string | null;
  /** Tells this version apart from the song's others, e.g. "Acoustic". */
  versionName?: string | null;
  sortTitle?: string | null;
  album?: string | null;
  year?: number | null;
  copyright?: string | null;
  copyrightYear?: number | null;
  publisher?: string | null;
  ccli?: string | null;
  isrc?: string | null;
  reference?: string | null;
  notes?: string | null;
  key?: string | null;
  tempo?: number | null;
  /** "4/4" */
  timeSignature?: string | null;
  durationSeconds?: number | null;
  /** Capo fret, 1-11; 0 or null for none. */
  capo?: number | null;
  /** Replace the song's composers. */
  composers?: string[];
  /** Replace the song's lyricists. */
  lyricists?: string[];
  /** Replace the song's writers (words and music), arrangers, translators and adaptors. */
  writers?: string[];
  arrangers?: string[];
  translators?: string[];
  adaptors?: string[];
  /** Replace the song's tags. */
  tagIds?: string[];
  /** Replaces the chart (empty clears it). */
  content?: string;
  /** content's format; guessed when left out. */
  contentFormat?: SupportedImportFormat;
  /** The chart as the structured editor holds it, IDs kept as they are (instead of content). */
  sections?: SectionV2[];
  /** The order the song is sung in (repeats, labels, key changes, notes); left out, it follows the sections. */
  flow?: SectionInstance[];
}

export interface CreateSongVersionInput extends SongFieldsInput {
  workId?: string;
  /** A song this is another version of: it joins that song's Work. */
  basedOnVersionId?: string;
  teamId?: string;
  title: string;
  language: string;
  /** At least one. */
  artists: string[];
}

export interface UpdateSongVersionInput extends SongFieldsInput {
  title?: string;
  language?: string;
  /** Replace the song's artists (at least one). */
  artists?: string[];
  /** The document revision the edit started from; the save fails (409) if someone saved since. */
  revision?: number;
}

/** A name already credited on songs you can see. */
export interface CreditSuggestion {
  name: string;
  /** Every role they're credited in: PERFORMER, COMPOSER, LYRICIST... */
  roles: string[];
  songCount: number;
}

/** A song in your library with the title you're adding, and its versions. */
export interface SongMatch {
  workId: string;
  versions: {
    id: string;
    workId: string;
    title: string;
    versionName: string | null;
    language: string;
    ownerScope: "GLOBAL" | "TEAM" | "USER";
    teamName: string | null;
    key: string | null;
    artists: string[];
    /** This version has the title (the others are its song's other versions). */
    matchesTitle: boolean;
  }[];
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
    /** The song it's linked to, as a translation or adaptation of it (issue #78). */
    parentVersionId: string | null;
    relationshipType: string | null;
    createdAt: string;
  }>;
  identifiers: WorkIdentifier[];
}

/**
 * `message` is the API's human-readable message when the body is a NestJS
 * error ({ message, code? }), otherwise the raw body; `code` is the
 * machine-readable one, when the API sent one (e.g. STORAGE_LIMIT_EXCEEDED).
 */
export type SubmissionState = "SUBMITTED" | "UNDER_REVIEW" | "NEEDS_CHANGES" | "APPROVED" | "REJECTED" | "WITHDRAWN";

/** A global song that looks like the one being published. */
export interface CatalogueMatch {
  id: string;
  title: string;
  versionName: string | null;
  language: string;
  artists: string[];
  reason: "titleAndArtist" | "title" | "ccli";
}

/** A song put forward for the global catalogue. */
export interface Submission {
  id: string;
  state: SubmissionState;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  submitterMessage: string | null;
  duplicateReason: string | null;
  reviewNotes: string | null;
  mergeTargetId: string | null;
  publishedVersionId: string | null;
  submitter: { id: string; displayName: string; email: string };
  reviewer: { id: string; displayName: string } | null;
  publishedVersion: { id: string; title: string } | null;
  /** Global look-alikes when it was submitted. */
  matches: CatalogueMatch[];
  song: {
    id: string;
    title: string;
    versionName: string | null;
    language: string;
    ownerScope: "GLOBAL" | "TEAM" | "USER";
    ownerUserId: string | null;
    ownerTeamId: string | null;
    teamName: string | null;
    artists: string[];
  };
}

/** Where a song stands with the global catalogue, for its page. */
export interface SongPublication {
  submission: Submission | null;
  /** The global song it's linked to, once approved. */
  published: { id: string; title: string } | null;
  matches: CatalogueMatch[];
  canSubmit: boolean;
  canPublishDirectly: boolean;
}

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
 * Thin fetch wrapper shared by every Songverse client (web now, React
 * Native later — see spec §5 "the web frontend and the React Native app
 * share only the packages/core layer"). Each app supplies its own
 * `getToken`; this client only knows how to attach it and parse JSON.
 */
export function createApiClient({ baseUrl, getToken, onUnauthorized, onChange }: ApiClientOptions) {
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
    if (init?.method && init.method !== "GET" && init.method !== "HEAD") onChange?.();
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
    updateMe: (data: {
      locale?: string;
      displayName?: string;
      instruments?: InstrumentValue[];
      techRoles?: TechRoleValue[];
      capoDisplayMode?: CapoDisplayModeValue;
      chordNotation?: ChordNotationValue;
    }) =>
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
    addSongbookCatalogEntry: (catalogId: string, data: SongbookCatalogEntryInput & { entryCode: string; title: string }) =>
      request<SongbookCatalogEntry>(`/songbook-catalogs/${catalogId}/entries`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    /** Changes only the fields given. */
    updateSongbookCatalogEntry: (catalogId: string, entryId: string, data: SongbookCatalogEntryInput) =>
      request<SongbookCatalogEntry>(`/songbook-catalogs/${catalogId}/entries/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    removeSongbookCatalogEntry: (catalogId: string, entryId: string) =>
      request<void>(`/songbook-catalogs/${catalogId}/entries/${entryId}`, { method: "DELETE" }),
    /** A CSV or JSON catalogue file (see docs/songbook-catalog-format.md); `dryRun` previews. */
    importSongbookCatalogEntries: (
      catalogId: string,
      file: { content: string; filename?: string; mode?: "merge" | "replace"; dryRun?: boolean },
    ) =>
      request<SongbookCatalogImportResult>(`/songbook-catalogs/${catalogId}/entries/import`, {
        method: "POST",
        body: JSON.stringify(file),
      }),
    /** A new catalogue, details and entries, from a JSON export. */
    createSongbookCatalogFromFile: (file: { content: string; filename?: string }) =>
      request<{ catalog: SongbookCatalogSummary; import: SongbookCatalogImportResult }>("/songbook-catalogs/import", {
        method: "POST",
        body: JSON.stringify(file),
      }),
    exportSongbookCatalog: async (catalogId: string, format: "csv" | "json"): Promise<Blob> => {
      const token = await getToken();
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(`${baseUrl}/songbook-catalogs/${catalogId}/export?format=${format}`, { headers });
      if (!response.ok) throw await failed(response);
      return response.blob();
    },

    listWorks: () => request<Array<{ id: string; title: string | null; createdAt: string }>>("/works"),
    getWork: (workId: string) => request<WorkDetail>(`/works/${workId}`),
    listSongVersions: (query: ListSongVersionsQuery = {}) => {
      const params = new URLSearchParams(
        Object.entries(query)
          .filter(([, value]) => value !== undefined && value !== "")
          .map(([key, value]) => [key, String(value)]),
      );
      return request<SongPage>(`/song-versions${params.size ? `?${params}` : ""}`);
    },
    getLibraryHome: () => request<LibraryHome>("/library/home"),
    getArtworkCandidates: (songVersionId: string) => request<ArtworkCandidate[]>(`/song-versions/${songVersionId}/artwork/candidates`),
    setArtwork: (songVersionId: string, url: string) => request<void>(`/song-versions/${songVersionId}/artwork`, { method: "PUT", body: JSON.stringify({ url }) }),
    clearArtwork: (songVersionId: string) => request<void>(`/song-versions/${songVersionId}/artwork`, { method: "DELETE" }),
    getArtworkSettings: () => request<ArtworkSettings>("/admin/artwork"),
    saveArtworkSettings: (change: { enabled?: boolean; country?: string }) => request<ArtworkSettings>("/admin/artwork", { method: "PUT", body: JSON.stringify(change) }),
    resetArtworkSettings: () => request<ArtworkSettings>("/admin/artwork", { method: "DELETE" }),
    /** An image of the editor's own for the song (issue #88). */
    uploadArtwork: (songVersionId: string, file: Blob, filename = "artwork") => {
      const form = new FormData();
      form.append("file", file, filename);
      return request<void>(`/song-versions/${songVersionId}/artwork/upload`, { method: "POST", body: form });
    },
    backfillArtwork: () => request<{ tried: number; found: number }>("/admin/artwork/backfill", { method: "POST" }),
    /** The songs before and after one in a list of the library, searched and filtered as `query` says (issue #84). */
    getSongNeighbors: (songVersionId: string, query: ListSongVersionsQuery = {}) => {
      const params = new URLSearchParams(
        Object.entries(query)
          .filter(([key, value]) => value !== undefined && value !== "" && key !== "page" && key !== "pageSize")
          .map(([key, value]) => [key, String(value)]),
      );
      return request<SongNeighbors>(`/song-versions/${songVersionId}/neighbors${params.size ? `?${params}` : ""}`);
    },
    /** The user opened the song (Recently viewed, and their teams' Popular). */
    recordSongView: (songVersionId: string) => request<void>(`/song-versions/${songVersionId}/views`, { method: "POST" }),
    setFavorite: (songVersionId: string, on: boolean) => request<void>(`/song-versions/${songVersionId}/favorite`, { method: on ? "PUT" : "DELETE" }),
    listArtists: (q?: string) => request<ArtistCount[]>(`/song-versions/artists${q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`),
    getArtist: (name: string) => request<ArtistDetail>(`/artists/detail?${new URLSearchParams({ name })}`),
    /** Asks the providers about them: once for anyone, again (`force`) for admins. */
    lookUpArtist: (name: string, force = false) => request<ArtistDetail>("/artists/lookup", { method: "POST", body: JSON.stringify({ name, force }) }),
    uploadArtistPicture: (name: string, file: Blob, filename = "artist.webp") => {
      const form = new FormData();
      form.append("file", file, filename);
      return request<void>(`/artists/picture?${new URLSearchParams({ name })}`, { method: "POST", body: form });
    },
    removeArtistPicture: (name: string) => request<void>(`/artists/picture?${new URLSearchParams({ name })}`, { method: "DELETE" }),
    /** An empty text removes the bio written here. */
    saveArtistBio: (name: string, language: string, text: string) =>
      request<void>("/artists/bio", { method: "PUT", body: JSON.stringify({ name, language, text }) }),
    getArtistSettings: () => request<ArtistSettings>("/admin/artists"),
    saveArtistSettings: (enabled: boolean) => request<ArtistSettings>("/admin/artists", { method: "PUT", body: JSON.stringify({ enabled }) }),
    resetArtistSettings: () => request<ArtistSettings>("/admin/artists", { method: "DELETE" }),
    backfillArtists: () => request<{ tried: number; found: number }>("/admin/artists/backfill", { method: "POST" }),
    listSmartLists: () => request<SmartList[]>("/smart-lists"),
    createSmartList: (name: string, filters: SmartListFilters) => request<SmartList>("/smart-lists", { method: "POST", body: JSON.stringify({ name, filters }) }),
    updateSmartList: (id: string, change: { name?: string; filters?: SmartListFilters }) =>
      request<SmartList>(`/smart-lists/${id}`, { method: "PATCH", body: JSON.stringify(change) }),
    deleteSmartList: (id: string) => request<void>(`/smart-lists/${id}`, { method: "DELETE" }),
    getSongStats: () => request<{ songCount: number; artistCount: number }>("/song-versions/stats"),
    getSongVersion: (songVersionId: string) => request<SongVersionDetail>(`/song-versions/${songVersionId}`),
    getSongVersionSongbooks: (songVersionId: string) =>
      request<SongVersionSongbookMembership[]>(`/song-versions/${songVersionId}/songbooks`),
    listAttachments: (songVersionId: string) => request<Attachment[]>(`/song-versions/${songVersionId}/attachments`),
    /** A file of your own on the song; only you see it unless `audience` says otherwise (issue #72). */
    uploadAttachment: (songVersionId: string, type: AttachmentType, file: File, stemPart?: StemPart | null, audience?: AttachmentAudience) => {
      const form = new FormData();
      form.append("type", type);
      if (stemPart) form.append("stemPart", stemPart);
      if (audience) form.append("visibility", audience.visibility);
      if (audience?.teamId) form.append("teamId", audience.teamId);
      form.append("file", file);
      return request<Attachment>(`/song-versions/${songVersionId}/attachments`, { method: "POST", body: form });
    },
    /** An audio file's part (a stem) and its recording's key and tempo; what's left out stays, null clears. */
    updateAttachment: (
      songVersionId: string,
      attachmentId: string,
      change: { stemPart?: StemPart | null; recordingKey?: string | null; recordingTempo?: number | null; visibility?: AttachmentVisibility; teamId?: string | null },
    ) => request<Attachment>(`/song-versions/${songVersionId}/attachments/${attachmentId}`, { method: "PATCH", body: JSON.stringify(change) }),
    deleteAttachment: (songVersionId: string, attachmentId: string) =>
      request<void>(`/song-versions/${songVersionId}/attachments/${attachmentId}`, { method: "DELETE" }),
    /** The file; `onProgress` hears each chunk as it arrives (bytes so far, and the size if the server says). */
    downloadAttachment: async (
      songVersionId: string,
      attachmentId: string,
      onProgress?: (received: number, total: number | null) => void,
    ): Promise<Blob> => {
      const token = await getToken();
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(
        `${baseUrl}/song-versions/${songVersionId}/attachments/${attachmentId}/download`,
        { headers },
      );
      if (!response.ok) throw await failed(response);
      if (!onProgress || !response.body) return response.blob();
      const total = Number(response.headers.get("Content-Length")) || null;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        onProgress(received, total);
      }
      return new Blob(chunks as BlobPart[], { type: response.headers.get("Content-Type") ?? undefined });
    },
    /**
     * A short-lived link to the file (issue #33), for an <audio src> that
     * streams and seeks without the Bearer token. Ask again once it expires.
     */
    getAttachmentLink: async (songVersionId: string, attachmentId: string): Promise<{ url: string; expiresAt: string }> => {
      const { path, expiresAt } = await request<{ path: string; expiresAt: string }>(`/song-versions/${songVersionId}/attachments/${attachmentId}/link`, { method: "POST" });
      return { url: `${baseUrl}${path}`, expiresAt };
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
    /** `teamId` moves the set to that team, or (null) makes it the current user's personal set. */
    updateSetlist: (setlistId: string, data: { name?: string | null; eventDate?: string | null; teamId?: string | null }) =>
      request<SetlistDetail>(`/setlists/${setlistId}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteSetlist: (setlistId: string) => request<void>(`/setlists/${setlistId}`, { method: "DELETE" }),
    searchSetlistSongs: (setlistId: string, query: string) =>
      request<SetlistSongRef[]>(`/setlists/${setlistId}/song-candidates?q=${encodeURIComponent(query)}`),
    addSetlistItem: (setlistId: string, data: { songVersionId: string; transposeSteps?: number }) =>
      request<SetlistDetail>(`/setlists/${setlistId}/items`, { method: "POST", body: JSON.stringify(data) }),
    updateSetlistItem: (
      setlistId: string,
      itemId: string,
      data: { songVersionId?: string; transposeSteps?: number; notes?: string | null; arrangementId?: string | null },
    ) => request<SetlistDetail>(`/setlists/${setlistId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(data) }),
    /** The current user's own preferences for this song as the set plays it (guests too). */
    setSetlistChartPreferences: (setlistId: string, itemId: string, preferences: Partial<ChartPreferences>) =>
      request<ChartPreferences>(`/setlists/${setlistId}/items/${itemId}/chart-preferences`, {
        method: "PUT",
        body: JSON.stringify({ preferences }),
      }),
    /** Gives a song of the set its own arrangement for this set (a copy of the one it played, or the song's order) and plays it. */
    createSetArrangement: (setlistId: string, itemId: string, name: string) =>
      request<{ arrangementId: string }>(`/setlists/${setlistId}/items/${itemId}/set-arrangement`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    listArrangements: (songVersionId: string) => request<ArrangementSummary[]>(`/song-versions/${songVersionId}/arrangements`),
    /** A new arrangement: the song's order to start with, or a copy of `copyFromId`; a team's when `teamId` is given. */
    createArrangement: (songVersionId: string, data: { name: string; description?: string | null; teamId?: string; copyFromId?: string }) =>
      request<ArrangementDetail>(`/song-versions/${songVersionId}/arrangements`, { method: "POST", body: JSON.stringify(data) }),
    getArrangement: (arrangementId: string) => request<ArrangementDetail>(`/arrangements/${arrangementId}`),
    /** Omitted fields are left alone; `updatedAt` (as loaded) refuses a save over a newer one (409). */
    updateArrangement: (
      arrangementId: string,
      data: { name?: string; description?: string | null; document?: ArrangementDocumentV2; isTeamDefault?: boolean; updatedAt?: string },
    ) => request<ArrangementDetail>(`/arrangements/${arrangementId}`, { method: "PATCH", body: JSON.stringify(data) }),
    markArrangementReviewed: (arrangementId: string) => request<ArrangementDetail>(`/arrangements/${arrangementId}/reviewed`, { method: "POST" }),
    deleteArrangement: (arrangementId: string) => request<void>(`/arrangements/${arrangementId}`, { method: "DELETE" }),
    getChartPreferences: (songVersionId: string, arrangementId?: string | null) =>
      request<ChartPreferences>(`/chart-preferences?songVersionId=${songVersionId}${arrangementId ? `&arrangementId=${arrangementId}` : ""}`),
    saveChartPreferences: (songVersionId: string, arrangementId: string | null, preferences: Partial<ChartPreferences>) =>
      request<ChartPreferences>("/chart-preferences", { method: "PUT", body: JSON.stringify({ songVersionId, arrangementId, preferences }) }),
    removeSetlistItem: (setlistId: string, itemId: string) =>
      request<SetlistDetail>(`/setlists/${setlistId}/items/${itemId}`, { method: "DELETE" }),
    getSetlistSong: (setlistId: string, itemId: string) => request<SetlistSongView>(`/setlists/${setlistId}/items/${itemId}/song`),
    getSetlistOffline: (setlistId: string) => request<SetlistOfflineCopy>(`/setlists/${setlistId}/offline`),
    syncOffline: (body: {
      days?: number;
      known: { id: string; version: string }[];
      knownSongs?: { id: string; version: string }[];
      knownSongbooks?: { id: string; version: string }[];
    }) => request<OfflineSyncResponse>("/offline/sync", { method: "POST", body: JSON.stringify(body) }),
    listOfflinePins: () => request<OfflinePin[]>("/offline/pins"),
    pinOffline: (kind: OfflinePinKind, targetId: string, includeAudio = false) =>
      request<OfflinePin>("/offline/pins", { method: "PUT", body: JSON.stringify({ kind, targetId, includeAudio }) }),
    unpinOffline: (kind: OfflinePinKind, targetId: string) => request<void>(`/offline/pins/${kind}/${targetId}`, { method: "DELETE" }),
    getOfflineSongs: (ids: string[]) => request<SongOfflineCopy[]>("/offline/songs", { method: "POST", body: JSON.stringify({ ids }) }),
    getSongbookOffline: (songbookId: string) => request<SongbookOfflineCopy>(`/offline/songbooks/${songbookId}`),
    searchSongbookEntries: (q: string) => request<SongbookEntryHit[]>(`/songbook-entries?q=${encodeURIComponent(q)}`),
    /** An empty note deletes it. */
    setSetlistNote: (setlistId: string, itemId: string, content: string) =>
      request<{ myNote: string }>(`/setlists/${setlistId}/items/${itemId}/my-note`, { method: "PUT", body: JSON.stringify({ content }) }),
    requestSongOwnership: (setlistId: string, itemId: string) =>
      request<SetlistDetail>(`/setlists/${setlistId}/items/${itemId}/ownership-request`, { method: "POST" }),
    getSetlistSharing: (setlistId: string) => request<SetlistSharing>(`/setlists/${setlistId}/sharing`),
    /** Turns the share link on, or replaces it (the old one stops working). */
    resetSetlistShareLink: (setlistId: string) => request<SetlistSharing>(`/setlists/${setlistId}/share-link`, { method: "POST" }),
    removeSetlistShareLink: (setlistId: string) => request<SetlistSharing>(`/setlists/${setlistId}/share-link`, { method: "DELETE" }),
    removeSetlistGuest: (setlistId: string, userId: string) =>
      request<SetlistSharing>(`/setlists/${setlistId}/guests/${userId}`, { method: "DELETE" }),
    leaveSetlist: (setlistId: string) => request<void>(`/setlists/${setlistId}/leave`, { method: "POST" }),
    getSetInvite: (token: string) => request<SetInvitePreview>(`/set-invites/${encodeURIComponent(token)}`),
    joinSetInvite: (token: string) =>
      request<{ setlistId: string }>(`/set-invites/${encodeURIComponent(token)}/join`, { method: "POST" }),
    listOwnershipRequests: () => request<SongOwnershipRequest[]>("/ownership-requests"),
    acceptOwnershipRequest: (requestId: string) => request<void>(`/ownership-requests/${requestId}/accept`, { method: "POST" }),
    declineOwnershipRequest: (requestId: string) => request<void>(`/ownership-requests/${requestId}/decline`, { method: "POST" }),
    reorderSetlistItems: (setlistId: string, itemIds: string[]) =>
      request<SetlistDetail>(`/setlists/${setlistId}/items/order`, { method: "PUT", body: JSON.stringify({ itemIds }) }),
    createSongVersion: (data: CreateSongVersionInput) =>
      request<SongVersionSummary>("/song-versions", { method: "POST", body: JSON.stringify(data) }),
    updateSongVersion: (songVersionId: string, data: UpdateSongVersionInput) =>
      request<SongVersionDetail>(`/song-versions/${songVersionId}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteSongVersion: (songVersionId: string) =>
      request<void>(`/song-versions/${songVersionId}`, { method: "DELETE" }),
    /** A change to a catalogue song, made as the song editor would save it, for a reviewer to accept (issue #74). */
    suggestChange: (songVersionId: string, data: UpdateSongVersionInput & { message?: string }) =>
      request<Suggestion>(`/song-versions/${songVersionId}/suggestions`, { method: "POST", body: JSON.stringify(data) }),
    /** Your own suggestions on a song. */
    listSongSuggestions: (songVersionId: string) => request<Suggestion[]>(`/song-versions/${songVersionId}/suggestions`),
    listSuggestions: (state: "open" | "closed" = "open") => request<Suggestion[]>(`/suggestions?state=${state}`),
    mySuggestions: () => request<Suggestion[]>("/suggestions/mine"),
    getSuggestion: (id: string) => request<SuggestionDetail>(`/suggestions/${id}`),
    acceptSuggestion: (id: string, notes?: string) =>
      request<Suggestion>(`/suggestions/${id}/accept`, { method: "POST", body: JSON.stringify({ notes }) }),
    declineSuggestion: (id: string, notes: string) =>
      request<Suggestion>(`/suggestions/${id}/decline`, { method: "POST", body: JSON.stringify({ notes }) }),
    withdrawSuggestion: (id: string) => request<Suggestion>(`/suggestions/${id}/withdraw`, { method: "POST" }),
    getPeople: () => request<PeopleOverview>("/people"),
    /** Asks someone to connect, by email or (someone from your teams) id; `connected` when they'd already asked you. */
    requestConnection: (to: { email?: string; userId?: string }) =>
      request<{ connected: boolean }>("/people/requests", { method: "POST", body: JSON.stringify(to) }),
    acceptConnection: (id: string) => request<void>(`/people/requests/${id}/accept`, { method: "POST" }),
    declineConnection: (id: string) => request<void>(`/people/requests/${id}/decline`, { method: "POST" }),
    cancelConnection: (id: string) => request<void>(`/people/requests/${id}`, { method: "DELETE" }),
    removePerson: (userId: string) => request<void>(`/people/${userId}`, { method: "DELETE" }),
    getSongShares: (songVersionId: string) => request<SongShare[]>(`/song-versions/${songVersionId}/shares`),
    shareSong: (songVersionId: string, userId: string, canEdit: boolean) =>
      request<SongShare[]>(`/song-versions/${songVersionId}/shares/${userId}`, { method: "PUT", body: JSON.stringify({ canEdit }) }),
    unshareSong: (songVersionId: string, userId: string) => request<void>(`/song-versions/${songVersionId}/shares/${userId}`, { method: "DELETE" }),
    /** Takes a song shared with you out of your library. */
    leaveSharedSong: (songVersionId: string) => request<void>(`/song-versions/${songVersionId}/shares/me`, { method: "DELETE" }),
    getSongHistory: (songVersionId: string) => request<SongRevisionEntry[]>(`/song-versions/${songVersionId}/history`),
    getSongRevision: (songVersionId: string, revisionId: string) =>
      request<SongRevisionDetail>(`/song-versions/${songVersionId}/history/${revisionId}`),
    restoreSongRevision: (songVersionId: string, revisionId: string) =>
      request<SongVersionDetail>(`/song-versions/${songVersionId}/history/${revisionId}/restore`, { method: "POST" }),
    searchCredits: (query: string) => request<CreditSuggestion[]>(`/song-versions/credits?q=${encodeURIComponent(query)}`),
    findSongMatches: (title: string) => request<SongMatch[]>(`/song-versions/matches?title=${encodeURIComponent(title)}`),
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
    /** Auto detect's search across the metadata providers that are on, merged and ranked (issue #22). */
    searchMetadata: (title: string, artist?: string) => {
      const params = new URLSearchParams({ title });
      if (artist) params.set("artist", artist);
      return request<MetadataSearchResult>(`/metadata/search?${params}`);
    },
    searchMusicBrainzWorks: (title: string) =>
      request<MusicBrainzWorkMatch[]>(`/musicbrainz/works/search?${new URLSearchParams({ title })}`),

    getSongMetadata: (songVersionId: string) => request<MetadataMatch | null>(`/song-versions/${songVersionId}/metadata`),
    /** Links a match (looked up again from its sources): its streaming links and artwork come with it. */
    linkSongMetadata: (songVersionId: string, match: Pick<MetadataMatch, "sources">) =>
      request<MetadataMatch>(`/song-versions/${songVersionId}/metadata-link`, {
        method: "POST",
        body: JSON.stringify({ sources: match.sources.map(({ provider, id }) => ({ provider, id })) }),
      }),
    unlinkSongMetadata: (songVersionId: string) => request<void>(`/song-versions/${songVersionId}/metadata-link`, { method: "DELETE" }),
    getMetadataSettings: () => request<MetadataSettings>("/admin/metadata"),
    saveMetadataSettings: (providers: ({ key: MetadataProviderKey } & Partial<Record<MetadataCapability, boolean>>)[]) =>
      request<MetadataSettings>("/admin/metadata", { method: "PUT", body: JSON.stringify({ providers }) }),
    resetMetadataSettings: () => request<MetadataSettings>("/admin/metadata", { method: "DELETE" }),
    /** A field left out keeps its value; an empty one clears it. */
    saveAppleMusicKey: (key: { teamId?: string; keyId?: string; privateKey?: string; tokenUrl?: string }) =>
      request<MetadataSettings>("/admin/metadata/apple-music", { method: "PUT", body: JSON.stringify(key) }),
    resetAppleMusicKey: () => request<MetadataSettings>("/admin/metadata/apple-music", { method: "DELETE" }),
    testAppleMusicKey: () => request<{ ok: boolean; message: string }>("/admin/metadata/apple-music/test", { method: "POST" }),
    /** Spotify's developer app (issue #89): a field left out keeps its value; an empty one clears it. */
    saveSpotifyApp: (app: { clientId?: string; clientSecret?: string; market?: string }) =>
      request<MetadataSettings>("/admin/metadata/spotify", { method: "PUT", body: JSON.stringify(app) }),
    resetSpotifyApp: () => request<MetadataSettings>("/admin/metadata/spotify", { method: "DELETE" }),
    testSpotifyApp: () => request<{ ok: boolean; message: string }>("/admin/metadata/spotify/test", { method: "POST" }),
    /** MusicBrainz's contact, in its User-Agent; empty goes back to MUSICBRAINZ_CONTACT. */
    saveMusicBrainzContact: (contact: string) => request<MetadataSettings>("/admin/metadata/musicbrainz", { method: "PUT", body: JSON.stringify({ contact }) }),

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
    getSongPublication: (songVersionId: string) => request<SongPublication>(`/song-versions/${songVersionId}/publication`),
    submitSong: (songVersionId: string, data: { message?: string; duplicateReason?: string }) =>
      request<Submission>(`/song-versions/${songVersionId}/submissions`, { method: "POST", body: JSON.stringify(data) }),
    /** Global admins: into the catalogue without a review. */
    publishSong: (songVersionId: string, data: { duplicateReason?: string; trustLabel?: string }) =>
      request<Submission>(`/song-versions/${songVersionId}/publish`, { method: "POST", body: JSON.stringify(data) }),
    /** The review queue (reviewers and global admins). */
    listSubmissions: (state: "open" | "closed" = "open") => request<Submission[]>(`/submissions?state=${state}`),
    mySubmissions: () => request<Submission[]>("/submissions/mine"),
    getSubmission: (submissionId: string) => request<Submission>(`/submissions/${submissionId}`),
    withdrawSubmission: (submissionId: string) => request<Submission>(`/submissions/${submissionId}/withdraw`, { method: "POST" }),
    resubmitSubmission: (submissionId: string, data: { message?: string }) =>
      request<Submission>(`/submissions/${submissionId}/resubmit`, { method: "POST", body: JSON.stringify(data) }),
    startReview: (submissionId: string) => request<Submission>(`/submissions/${submissionId}/start-review`, { method: "POST" }),
    approveSubmission: (submissionId: string, data: { notes?: string; trustLabel?: string }) =>
      request<Submission>(`/submissions/${submissionId}/approve`, { method: "POST", body: JSON.stringify(data) }),
    mergeSubmission: (submissionId: string, data: { targetId: string; notes?: string }) =>
      request<Submission>(`/submissions/${submissionId}/merge`, { method: "POST", body: JSON.stringify(data) }),
    requestSubmissionChanges: (submissionId: string, notes: string) =>
      request<Submission>(`/submissions/${submissionId}/request-changes`, { method: "POST", body: JSON.stringify({ notes }) }),
    rejectSubmission: (submissionId: string, notes: string) =>
      request<Submission>(`/submissions/${submissionId}/reject`, { method: "POST", body: JSON.stringify({ notes }) }),

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
