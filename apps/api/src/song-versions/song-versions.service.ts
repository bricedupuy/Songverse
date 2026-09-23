import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  computeSectionLabel,
  parseChordPro,
  parseChordsOverLyrics,
  parseSongDocument,
  parseStreamingLink,
  serializeChordPro,
  splitNames,
  type CatalogEntryData,
  type SongbookSection,
  type SongDocument,
  type StreamingIdentifierType,
  type SupportedImportFormat,
} from "@songverse/core";
import type { ContributorRole, Prisma, VersionRelationshipType } from "@songverse/db";
import { MusicBrainzService } from "../musicbrainz/musicbrainz.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { isOwnedByOrMemberOf } from "../common/utils/ownership-visibility";
import type { CreateSongVersionDto } from "./dto/create-song-version.dto";
import type { UpdateSongVersionDto } from "./dto/update-song-version.dto";

/** A version's own fields (the columns, and their mirror in documentJson.metadata). */
type VersionFields = {
  title: string;
  language: string;
  alternateTitle?: string | null;
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
};

type CreateExtras = {
  defaults?: SongDocument["defaults"];
  credits?: { source: string; roles: ContributorRole[] }[];
  tagIds?: string[];
  /** Add to this existing Work. */
  workId?: string;
  /** Derived from this version (e.g. a translation of it): joins its Work. */
  parent?: { id: string; workId: string; relationshipType: VersionRelationshipType };
};

/** One credit per person (ignoring case), with all their roles. */
function mergeCredits(entries: readonly (readonly [string, ContributorRole])[]): { source: string; roles: ContributorRole[] }[] {
  const credits: { source: string; roles: ContributorRole[] }[] = [];
  for (const [name, role] of entries) {
    const existing = credits.find((credit) => credit.source.toLowerCase() === name.toLowerCase());
    if (!existing) credits.push({ source: name, roles: [role] });
    else if (!existing.roles.includes(role)) existing.roles.push(role);
  }
  return credits;
}

/**
 * Swaps the artist a MusicBrainz link added (isAutoAttached) for `artist`
 * - or removes it, for null. A previous link's row is replaced so
 * re-linking doesn't leave the old artist alongside the new one, and rows
 * added by hand (a composer, say) aren't touched. Two rules on top: no
 * second copy of an artist the song already credits, and a song never
 * ends up with no artist - the old one is then kept, as an ordinary one.
 */
async function replaceAutoAttachedArtist(tx: Prisma.TransactionClient, songVersionId: string, artist: string | null): Promise<void> {
  const performers = await tx.versionContributor.findMany({
    where: { songVersionId, roles: { has: "PERFORMER" } },
    select: { id: true, source: true, isAutoAttached: true },
  });
  const manual = performers.filter((p) => !p.isAutoAttached);
  const auto = performers.filter((p) => p.isAutoAttached);
  const same = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();

  if (artist && !manual.some((p) => same(p.source, artist))) {
    if (auto.length === 1 && same(auto[0]!.source, artist)) return;
    await tx.versionContributor.deleteMany({ where: { songVersionId, isAutoAttached: true } });
    await tx.versionContributor.create({ data: { songVersionId, userId: null, source: artist, roles: ["PERFORMER"], isAutoAttached: true } });
    return;
  }
  if (manual.length > 0 || auto.length === 0) {
    await tx.versionContributor.deleteMany({ where: { songVersionId, isAutoAttached: true } });
    return;
  }
  // The link's artist is the only one: keep it, now as the song's own.
  await tx.versionContributor.updateMany({ where: { songVersionId, isAutoAttached: true }, data: { isAutoAttached: false } });
}

function parseTimeSignature(text: string | null): { numerator: number; denominator: number } | null {
  const match = text ? /^(\d+)\/(\d+)$/.exec(text) : null;
  return match ? { numerator: Number(match[1]), denominator: Number(match[2]) } : null;
}

function foldName(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}

const LIST_SELECT = {
  id: true,
  workId: true,
  title: true,
  alternateTitle: true,
  language: true,
  ownerScope: true,
  ownerUserId: true,
  ownerTeamId: true,
  publicationState: true,
  ccli: true,
  createdAt: true,
  updatedAt: true,
  // Just the artist(s) — enough for the library list to show "Title —
  // Artist" without pulling in the full contributor list (composer,
  // lyricist, etc.), which only the detail page needs.
  contributors: {
    where: { roles: { has: "PERFORMER" as ContributorRole } },
    select: { id: true, userId: true, source: true },
    orderBy: { displayOrder: "asc" },
  },
  versionTags: {
    select: {
      id: true,
      tag: { select: { id: true, categoryId: true, slug: true, label: true, translations: true } },
    },
  },
} satisfies Prisma.SongVersionSelect;

const STREAMING_IDENTIFIER_TYPES = ["SPOTIFY", "APPLE_MUSIC", "YOUTUBE"] as const;

export interface SongVersionOwner {
  ownerScope: "GLOBAL" | "TEAM" | "USER";
  ownerUserId: string | null;
  ownerTeamId: string | null;
}

const DETAIL_SELECT = {
  ...LIST_SELECT,
  sortTitle: true,
  album: true,
  year: true,
  copyright: true,
  copyrightYear: true,
  publisher: true,
  isrc: true,
  reference: true,
  notes: true,
  relationshipType: true,
  // The version this one derives from (e.g. the original of a translation).
  parentVersion: { select: { id: true, title: true, language: true } },
  documentJson: true,
  contributors: {
    select: { id: true, userId: true, source: true, roles: true, isAutoAttached: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  },
  // CCLI has its own column and MusicBrainz its own endpoint (live lookup) -
  // this is just the plain "links" (Spotify/Apple Music/YouTube/custom),
  // which have nothing more to fetch than what's stored.
  identifiers: {
    where: { type: { in: [...STREAMING_IDENTIFIER_TYPES, "CUSTOM"] } },
    select: { id: true, type: true, value: true, sourceUrl: true },
  },
} satisfies Prisma.SongVersionSelect;

type ListRow = Prisma.SongVersionGetPayload<{ select: typeof LIST_SELECT }>;
type ListItem = Omit<ListRow, "contributors" | "versionTags"> & {
  artists: ListRow["contributors"];
  tags: ListRow["versionTags"][number]["tag"][];
};

// The Prisma relations are named `contributors`/`versionTags` no matter
// how they're filtered; renamed here (`artists`, `tags`) so the
// (performer-only) list/create payload and the (all-roles) detail payload
// don't share a field name that means two different things, and so the
// join row (versionTags' own `id`, not useful to the client) doesn't leak
// into what's otherwise just a list of tags.
function toListItem({ contributors, versionTags, ...rest }: ListRow): ListItem {
  return { ...rest, artists: contributors, tags: versionTags.map((vt) => vt.tag) };
}

type DetailRow = Prisma.SongVersionGetPayload<{ select: typeof DETAIL_SELECT }>;
type DetailItem = Omit<DetailRow, "versionTags"> & {
  artists: DetailRow["contributors"];
  tags: DetailRow["versionTags"][number]["tag"][];
};

function toDetailItem(version: DetailRow): DetailItem {
  const { versionTags, ...rest } = version;
  return {
    ...rest,
    artists: version.contributors.filter((c) => c.roles.includes("PERFORMER")),
    tags: versionTags.map((vt) => vt.tag),
  };
}

@Injectable()
export class SongVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly musicBrainz: MusicBrainzService,
  ) {}

  /**
   * Lists Song Versions visible to the user (same visibility rule as
   * WorksService — Phase 2 will replace this with Meilisearch-backed
   * search and proper pagination).
   */
  async findVisibleToUser(userId: string): Promise<ListItem[]> {
    const teamIds = (
      await this.prisma.client.teamMembership.findMany({
        where: { userId },
        select: { teamId: true },
      })
    ).map((m) => m.teamId);

    const versions = await this.prisma.client.songVersion.findMany({
      where: {
        OR: [
          { ownerScope: "GLOBAL", publicationState: "APPROVED" },
          { ownerScope: "USER", ownerUserId: userId },
          { ownerScope: "TEAM", ownerTeamId: { in: teamIds } },
        ],
      },
      select: LIST_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return versions.map(toListItem);
  }

  async findOne(user: AuthenticatedUser, id: string): Promise<DetailItem> {
    const version = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!version) throw new NotFoundException("Song version not found");
    await this.assertVisible(user, version);
    return toDetailItem(version);
  }

  /**
   * Same visibility rule as findOne(), exposed standalone so other
   * services nesting resources under a song version (e.g. Attachments)
   * can enforce it without pulling the full detail payload.
   */
  async assertVisibleById(user: AuthenticatedUser, songVersionId: string): Promise<void> {
    const version = await this.prisma.client.songVersion.findUnique({
      where: { id: songVersionId },
      select: { ownerScope: true, ownerUserId: true, ownerTeamId: true, publicationState: true },
    });
    if (!version) throw new NotFoundException("Song version not found");
    await this.assertVisible(user, version);
  }

  private async assertVisible(
    user: AuthenticatedUser,
    version: { ownerScope: string; ownerUserId: string | null; ownerTeamId: string | null; publicationState: string },
  ): Promise<void> {
    const visible =
      (version.ownerScope === "GLOBAL" && (version.publicationState === "APPROVED" || user.isGlobalAdmin)) ||
      (await isOwnedByOrMemberOf(this.prisma, user, version));
    if (!visible) throw new ForbiddenException("Not visible to you");
  }

  /**
   * Lists the songbooks this song version is a member of, filtered to
   * what `user` can see - a private songbook's membership (e.g. someone
   * else's personal set list) must never leak through a song that's
   * otherwise publicly visible. See docs/songbooks-and-catalog.md §5.
   */
  async findSongbookMemberships(user: AuthenticatedUser, songVersionId: string) {
    const entries = await this.prisma.client.songbookEntry.findMany({
      where: { songVersionId },
      include: { songbook: true },
    });

    const visibility = await Promise.all(
      entries.map((entry) =>
        entry.songbook.ownerScope === "GLOBAL"
          ? Promise.resolve(true)
          : isOwnedByOrMemberOf(this.prisma, user, entry.songbook),
      ),
    );

    return entries
      .filter((_, index) => visibility[index])
      .map((entry) => ({
        songbookId: entry.songbookId,
        songbookName: entry.songbook.name,
        entryCode: entry.entryCode,
        sectionLabel: computeSectionLabel(entry.entryCode, entry.songbook.sections as SongbookSection[] | null),
      }));
  }

  /**
   * Creates a new Song Version, with its artist(s). Without a `workId`,
   * this also creates a new Work with this version set as its preferred
   * original — a Work has no title of its own (it's just the grouping of
   * versions of "the same song"), so a version is the smallest thing a
   * user can meaningfully create on its own.
   */
  async create(user: AuthenticatedUser, dto: CreateSongVersionDto): Promise<ListItem> {
    let ownerTeamId: string | null = null;
    if (dto.teamId) {
      const membership = await this.prisma.client.teamMembership.findUnique({
        where: { teamId_userId: { teamId: dto.teamId, userId: user.id } },
      });
      if (!membership) throw new ForbiddenException("Not a member of this team");
      ownerTeamId = dto.teamId;
    }
    const ownerScope = ownerTeamId ? "TEAM" : "USER";
    const owner: SongVersionOwner = { ownerScope, ownerUserId: ownerTeamId ? null : user.id, ownerTeamId };

    if (dto.workId) {
      const work = await this.prisma.client.work.findUnique({ where: { id: dto.workId }, select: { id: true } });
      if (!work) throw new NotFoundException("Work not found");
    }
    const { title, language, alternateTitle, copyright, copyrightYear, publisher, ccli } = dto;
    return this.createVersion(owner, { title, language, alternateTitle, copyright, copyrightYear, publisher, ccli }, {
      workId: dto.workId,
      credits: mergeCredits(dto.artists.map((name) => [name, "PERFORMER"] as const)),
    });
  }

  /**
   * A new song from a songbook catalogue entry, under any ownership
   * (including GLOBAL, which the public create() endpoint never lets a
   * caller pick). Used by SongbooksService when materializing a pending
   * catalog entry - see docs/songbooks-and-catalog.md §6 and
   * docs/songbook-catalog-format.md. Every field of the entry is carried
   * over: song fields, key/tempo/time signature/duration on the chart,
   * artists, composers and lyricists as credits (several per field,
   * separated by ";"), tags matching existing ones (the rest are dropped),
   * and - given the song its "Original song" entry became - a place in that
   * song's Work as its translation.
   */
  async createFromCatalogEntry(
    owner: SongVersionOwner,
    entry: CatalogEntryData,
    language: string,
    original: { id: string; workId: string } | null = null,
  ): Promise<ListItem> {
    const timeSignature = parseTimeSignature(entry.timeSignature);
    return this.createVersion(
      owner,
      {
        title: entry.title,
        language,
        alternateTitle: entry.subtitle,
        sortTitle: entry.sortTitle,
        album: entry.album,
        year: entry.year,
        copyright: entry.copyright,
        ccli: entry.ccli,
        isrc: entry.isrc,
        reference: entry.reference,
        notes: entry.notes,
      },
      {
        defaults: {
          ...(entry.key && { key: entry.key }),
          ...(entry.tempo && { tempo: entry.tempo }),
          ...(timeSignature && { timeSignature }),
          ...(entry.durationSeconds && { durationSeconds: entry.durationSeconds }),
        },
        credits: mergeCredits([
          ...splitNames(entry.artist).map((name) => [name, "PERFORMER"] as const),
          ...splitNames(entry.composer).map((name) => [name, "COMPOSER"] as const),
          ...splitNames(entry.lyricist).map((name) => [name, "LYRICIST"] as const),
        ]),
        tagIds: await this.matchTagIds(owner, entry.tags),
        parent: original ? { ...original, relationshipType: "DIRECT_TRANSLATION" } : undefined,
      },
    );
  }

  /**
   * Ids of the existing tags the owner can use whose name - English label,
   * slug, or any translation - matches one of `names`, ignoring case and
   * accents. Names with no such tag are dropped.
   */
  private async matchTagIds(owner: SongVersionOwner, names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const tags = await this.prisma.client.tag.findMany({
      where: {
        OR: [
          { scope: "GLOBAL", isApproved: true },
          ...(owner.ownerUserId ? [{ scope: "USER" as const, ownerUserId: owner.ownerUserId }] : []),
          ...(owner.ownerTeamId ? [{ scope: "TEAM" as const, ownerTeamId: owner.ownerTeamId }] : []),
        ],
      },
      select: { id: true, label: true, slug: true, translations: true },
    });
    const byName = new Map<string, string>();
    for (const tag of tags) {
      const translations = tag.translations && typeof tag.translations === "object" ? Object.values(tag.translations) : [];
      for (const name of [tag.label, tag.slug.replace(/-/g, " "), ...translations]) {
        if (typeof name === "string" && !byName.has(foldName(name))) byName.set(foldName(name), tag.id);
      }
    }
    return [...new Set(names.map((name) => byName.get(foldName(name))).filter((id): id is string => !!id))];
  }

  private buildVersionData(owner: SongVersionOwner, fields: VersionFields, defaults: SongDocument["defaults"] = {}) {
    const documentJson: SongDocument = parseSongDocument({
      $schema: "song-document/v1",
      metadata: {
        title: fields.title,
        alternateTitle: fields.alternateTitle ?? null,
        language: fields.language,
        ccli: fields.ccli ?? null,
        copyright: fields.copyright ?? null,
        copyrightYear: fields.copyrightYear ?? null,
        publisher: fields.publisher ?? null,
        trustLabel: null,
      },
      defaults,
      sections: [],
    });

    return {
      ...owner,
      title: fields.title,
      alternateTitle: fields.alternateTitle ?? null,
      sortTitle: fields.sortTitle ?? null,
      language: fields.language,
      album: fields.album ?? null,
      year: fields.year ?? null,
      copyright: fields.copyright ?? null,
      copyrightYear: fields.copyrightYear ?? null,
      publisher: fields.publisher ?? null,
      ccli: fields.ccli ?? null,
      isrc: fields.isrc ?? null,
      reference: fields.reference ?? null,
      notes: fields.notes ?? null,
      documentJson: documentJson as object,
      chordproCache: serializeChordPro(documentJson),
      chordproCacheAt: new Date(),
    };
  }

  /**
   * One transaction: the version, in a new Work (or `workId`'s, or as
   * `parent`'s derived version in its Work), with its credits and tags.
   */
  private async createVersion(owner: SongVersionOwner, fields: VersionFields, extras: CreateExtras = {}): Promise<ListItem> {
    const versionData = this.buildVersionData(owner, fields, extras.defaults);
    const version = await this.prisma.client.$transaction(async (tx) => {
      const existingWorkId = extras.parent?.workId ?? extras.workId;
      const workId = existingWorkId ?? (await tx.work.create({ data: {} })).id;
      const created = await tx.songVersion.create({
        data: {
          ...versionData,
          workId,
          ...(extras.parent && { parentVersionId: extras.parent.id, relationshipType: extras.parent.relationshipType }),
        },
        select: { id: true },
      });
      if (extras.credits?.length) {
        await tx.versionContributor.createMany({
          data: extras.credits.map((credit, displayOrder) => ({ songVersionId: created.id, source: credit.source, roles: credit.roles, displayOrder })),
        });
      }
      if (extras.tagIds?.length) {
        await tx.songVersionTag.createMany({ data: extras.tagIds.map((tagId) => ({ songVersionId: created.id, tagId })) });
      }
      if (!existingWorkId) {
        await tx.work.update({ where: { id: workId }, data: { preferredOriginalVersionId: created.id } });
      }
      return tx.songVersion.findUniqueOrThrow({ where: { id: created.id }, select: LIST_SELECT });
    });
    return toListItem(version);
  }

  /**
   * Partial update. Scalar SongVersion columns and documentJson.metadata
   * are kept in sync per the schema's own convention (see the ccli column
   * comment) — the editor will eventually read/write documentJson
   * directly, but until then these mirrored top-level columns are what
   * list/filter queries actually use.
   */
  async update(id: string, dto: UpdateSongVersionDto): Promise<DetailItem> {
    const existing = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: { documentJson: true },
    });
    if (!existing) throw new NotFoundException("Song version not found");

    const currentDoc = existing.documentJson as SongDocument;
    const documentJson: SongDocument = parseSongDocument({
      ...currentDoc,
      metadata: {
        ...currentDoc.metadata,
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.alternateTitle !== undefined && { alternateTitle: dto.alternateTitle }),
        ...(dto.language !== undefined && { language: dto.language }),
        ...(dto.ccli !== undefined && { ccli: dto.ccli }),
        ...(dto.copyright !== undefined && { copyright: dto.copyright }),
        ...(dto.copyrightYear !== undefined && { copyrightYear: dto.copyrightYear }),
        ...(dto.publisher !== undefined && { publisher: dto.publisher }),
      },
      defaults: {
        ...currentDoc.defaults,
        ...(dto.key !== undefined && { key: dto.key }),
        ...(dto.tempo !== undefined && { tempo: dto.tempo }),
        ...(dto.timeSignature !== undefined && { timeSignature: parseTimeSignature(dto.timeSignature) }),
        ...(dto.durationSeconds !== undefined && { durationSeconds: dto.durationSeconds }),
      },
    });

    // Key, tempo, time signature and duration live only in
    // documentJson.defaults (handled above) - not real SongVersion columns,
    // so they're left out of this scalar update. undefined leaves a column
    // alone; null clears it.
    const version = await this.prisma.client.songVersion.update({
      where: { id },
      data: {
        title: dto.title,
        alternateTitle: dto.alternateTitle,
        sortTitle: dto.sortTitle,
        language: dto.language,
        album: dto.album,
        year: dto.year,
        ccli: dto.ccli,
        isrc: dto.isrc,
        copyright: dto.copyright,
        copyrightYear: dto.copyrightYear,
        publisher: dto.publisher,
        reference: dto.reference,
        notes: dto.notes,
        documentJson: documentJson as object,
        chordproCache: serializeChordPro(documentJson),
        chordproCacheAt: new Date(),
      },
      select: DETAIL_SELECT,
    });
    return toDetailItem(version);
  }

  /**
   * Replaces this version's content with the result of parsing pasted
   * text - either ChordPro(-ish) or "chords on their own line above the
   * lyric" (the plain format most tab/chord sites display on-screen) -
   * leaving metadata untouched. The cache is regenerated from the parsed
   * result rather than stored verbatim, so it reflects what was actually
   * understood (whitespace normalized, unknown directives dropped) rather
   * than whatever the user happened to paste.
   */
  async importText(id: string, content: string, format: SupportedImportFormat): Promise<DetailItem> {
    const existing = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: { documentJson: true },
    });
    if (!existing) throw new NotFoundException("Song version not found");

    const currentDoc = existing.documentJson as SongDocument;
    const documentJson: SongDocument = parseSongDocument({
      ...currentDoc,
      sections: format === "CHORDS_OVER_LYRICS" ? parseChordsOverLyrics(content) : parseChordPro(content),
    });

    const version = await this.prisma.client.songVersion.update({
      where: { id },
      data: {
        documentJson: documentJson as object,
        chordproCache: serializeChordPro(documentJson),
        chordproCacheAt: new Date(),
      },
      select: DETAIL_SELECT,
    });
    return toDetailItem(version);
  }

  async exportChordPro(id: string): Promise<string> {
    const version = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: { chordproCache: true },
    });
    if (!version) throw new NotFoundException("Song version not found");
    return version.chordproCache ?? "";
  }

  async setStreamingLink(songVersionId: string, type: StreamingIdentifierType, url: string) {
    const { value, sourceUrl } = parseStreamingLink(type, url);
    return this.prisma.client.songVersionIdentifier.upsert({
      where: { songVersionId_type: { songVersionId, type } },
      create: { songVersionId, type, value, sourceUrl, verifiedAt: null },
      update: { value, sourceUrl, verifiedAt: null },
      select: { id: true, type: true, value: true, sourceUrl: true },
    });
  }

  async removeStreamingLink(songVersionId: string, type: StreamingIdentifierType): Promise<void> {
    await this.prisma.client.songVersionIdentifier.deleteMany({ where: { songVersionId, type } });
  }

  /**
   * Deletes a Song Version. A Work has no content of its own — if this
   * was its only version, the Work is deleted with it rather than left
   * behind empty.
   */
  async remove(id: string): Promise<void> {
    const version = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: { workId: true },
    });
    if (!version) throw new NotFoundException("Song version not found");

    const siblingCount = await this.prisma.client.songVersion.count({
      where: { workId: version.workId, NOT: { id } },
    });

    await this.prisma.client.$transaction(async (tx) => {
      // Clear the Work's preferredOriginalVersionId FK before deleting the
      // version it points to, whether or not the Work itself survives.
      await tx.work.updateMany({
        where: { id: version.workId, preferredOriginalVersionId: id },
        data: { preferredOriginalVersionId: null },
      });
      await tx.songVersion.delete({ where: { id } });
      if (siblingCount === 0) {
        await tx.work.delete({ where: { id: version.workId } });
      }
    });
  }

  async linkMusicBrainzRecording(songVersionId: string, mbid: string) {
    const match = await this.musicBrainz.getRecording(mbid);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.songVersionIdentifier.upsert({
        where: { songVersionId_type: { songVersionId, type: "MUSICBRAINZ_RECORDING" } },
        create: {
          songVersionId,
          type: "MUSICBRAINZ_RECORDING",
          value: mbid,
          sourceUrl: match.sourceUrl,
          verifiedAt: new Date(),
        },
        update: { value: mbid, sourceUrl: match.sourceUrl, verifiedAt: new Date() },
      });
      await replaceAutoAttachedArtist(tx, songVersionId, match.artist ?? null);
    });
    return match;
  }

  async unlinkMusicBrainzRecording(songVersionId: string) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.songVersionIdentifier.deleteMany({ where: { songVersionId, type: "MUSICBRAINZ_RECORDING" } });
      await replaceAutoAttachedArtist(tx, songVersionId, null);
    });
  }

  async addContributor(songVersionId: string, source: string, roles: string[]) {
    return this.prisma.client.versionContributor.create({
      data: {
        songVersionId,
        userId: null,
        source,
        roles: roles.map((r) => r.toUpperCase()) as ContributorRole[],
      },
      select: { id: true, userId: true, source: true, roles: true, isAutoAttached: true, displayOrder: true },
    });
  }

  /** A song's last artist can't be removed - it needs at least one. */
  async removeContributor(songVersionId: string, contributorId: string): Promise<void> {
    const contributor = await this.prisma.client.versionContributor.findFirst({
      where: { id: contributorId, songVersionId },
      select: { roles: true },
    });
    if (!contributor) throw new NotFoundException("Contributor not found");
    if (contributor.roles.includes("PERFORMER")) {
      const artists = await this.prisma.client.versionContributor.count({ where: { songVersionId, roles: { has: "PERFORMER" } } });
      if (artists <= 1) throw new BadRequestException("A song needs at least one artist. Add another before removing this one.");
    }
    await this.prisma.client.versionContributor.delete({ where: { id: contributorId } });
  }

  async addTag(songVersionId: string, tagId: string) {
    const tag = await this.prisma.client.tag.findUnique({ where: { id: tagId } });
    if (!tag) throw new NotFoundException("Tag not found");

    await this.prisma.client.songVersionTag.upsert({
      where: { songVersionId_tagId: { songVersionId, tagId } },
      update: {},
      create: { songVersionId, tagId },
    });
    return tag;
  }

  async removeTag(songVersionId: string, tagId: string): Promise<void> {
    await this.prisma.client.songVersionTag.deleteMany({ where: { songVersionId, tagId } });
  }

  async getMusicBrainzInfo(songVersionId: string) {
    const identifier = await this.prisma.client.songVersionIdentifier.findUnique({
      where: { songVersionId_type: { songVersionId, type: "MUSICBRAINZ_RECORDING" } },
    });
    if (!identifier) return null;
    return this.musicBrainz.getRecording(identifier.value);
  }
}
