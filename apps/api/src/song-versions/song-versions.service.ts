import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  computeSectionLabel,
  parseChordPro,
  parseChordsOverLyrics,
  parseSongDocument,
  parseStreamingLink,
  serializeChordPro,
  type CatalogEntryData,
  type SongbookSection,
  type SongDocument,
  type StreamingIdentifierType,
  type SupportedImportFormat,
} from "@songverse/core";
import type { ContributorRole, Prisma } from "@songverse/db";
import { MusicBrainzService } from "../musicbrainz/musicbrainz.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { isOwnedByOrMemberOf } from "../common/utils/ownership-visibility";
import type { CreateSongVersionDto } from "./dto/create-song-version.dto";
import type { UpdateSongVersionDto } from "./dto/update-song-version.dto";

type CatalogEntryFacts = Pick<
  CatalogEntryData,
  "title" | "subtitle" | "copyright" | "year" | "ccli" | "key" | "tempo" | "timeSignature" | "artist" | "composer" | "lyricist"
>;

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
   * Creates a new Song Version. Without a `workId`, this also creates a
   * new Work with this version set as its preferred original — a Work
   * has no title of its own (it's just the grouping of versions of "the
   * same song"), so a version is the smallest thing a user can meaningfully
   * create on its own.
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
      const work = await this.prisma.client.work.findUnique({ where: { id: dto.workId } });
      if (!work) throw new NotFoundException("Work not found");
      const version = await this.prisma.client.songVersion.create({
        data: { ...this.buildVersionData(owner, dto), workId: work.id },
        select: LIST_SELECT,
      });
      return toListItem(version);
    }

    return this.createWithNewWork(owner, dto);
  }

  /**
   * A new song from a songbook catalogue entry, under any ownership
   * (including GLOBAL, which the public create() endpoint never lets a
   * caller pick). Used by SongbooksService when materializing a pending
   * catalog entry - see docs/songbooks-and-catalog.md §6. Carries over what
   * a song has somewhere to keep: subtitle, copyright and year, CCLI, key,
   * tempo, time signature, and the artist, composer and lyricist as credits.
   */
  async createFromCatalogEntry(owner: SongVersionOwner, entry: CatalogEntryFacts, language: string): Promise<ListItem> {
    const time = entry.timeSignature ? /^(\d+)\/(\d+)$/.exec(entry.timeSignature) : null;
    const credits = new Map<string, Set<ContributorRole>>();
    const credit = (name: string | null, role: ContributorRole) => {
      const source = name?.trim();
      if (!source) return;
      const key = [...credits.keys()].find((existing) => existing.toLowerCase() === source.toLowerCase()) ?? source;
      credits.set(key, (credits.get(key) ?? new Set()).add(role));
    };
    credit(entry.artist, "PERFORMER");
    credit(entry.composer, "COMPOSER");
    credit(entry.lyricist, "LYRICIST");

    return this.createWithNewWork(
      owner,
      {
        title: entry.title,
        language,
        alternateTitle: entry.subtitle ?? undefined,
        copyright: entry.copyright ?? undefined,
        copyrightYear: entry.year ?? undefined,
        ccli: entry.ccli ?? undefined,
      },
      {
        defaults: {
          ...(entry.key && { key: entry.key }),
          ...(entry.tempo && { tempo: entry.tempo }),
          ...(time && { timeSignature: { numerator: Number(time[1]), denominator: Number(time[2]) } }),
        },
        credits: [...credits].map(([source, roles]) => ({ source, roles: [...roles] })),
      },
    );
  }

  private buildVersionData(
    owner: SongVersionOwner,
    dto: {
      title: string;
      alternateTitle?: string;
      language: string;
      copyright?: string;
      copyrightYear?: number;
      publisher?: string;
      ccli?: string;
    },
    defaults: SongDocument["defaults"] = {},
  ) {
    const documentJson: SongDocument = parseSongDocument({
      $schema: "song-document/v1",
      metadata: {
        title: dto.title,
        alternateTitle: dto.alternateTitle ?? null,
        language: dto.language,
        ccli: dto.ccli ?? null,
        copyright: dto.copyright ?? null,
        copyrightYear: dto.copyrightYear ?? null,
        publisher: dto.publisher ?? null,
        trustLabel: null,
      },
      defaults,
      sections: [],
    });

    return {
      ...owner,
      title: dto.title,
      alternateTitle: dto.alternateTitle,
      language: dto.language,
      copyright: dto.copyright,
      copyrightYear: dto.copyrightYear,
      publisher: dto.publisher,
      ccli: dto.ccli,
      documentJson: documentJson as object,
      chordproCache: serializeChordPro(documentJson),
      chordproCacheAt: new Date(),
    };
  }

  private async createWithNewWork(
    owner: SongVersionOwner,
    dto: { title: string; language: string; alternateTitle?: string; copyright?: string; copyrightYear?: number; ccli?: string },
    extras: { defaults?: SongDocument["defaults"]; credits?: { source: string; roles: ContributorRole[] }[] } = {},
  ): Promise<ListItem> {
    const versionData = this.buildVersionData(owner, dto, extras.defaults);
    const version = await this.prisma.client.$transaction(async (tx) => {
      const work = await tx.work.create({ data: {} });
      const created = await tx.songVersion.create({
        data: { ...versionData, workId: work.id },
        select: LIST_SELECT,
      });
      if (extras.credits?.length) {
        await tx.versionContributor.createMany({
          data: extras.credits.map((credit, displayOrder) => ({ songVersionId: created.id, source: credit.source, roles: credit.roles, displayOrder })),
        });
      }
      await tx.work.update({
        where: { id: work.id },
        data: { preferredOriginalVersionId: created.id },
      });
      return created;
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
      },
    });

    // key/tempo live only in documentJson.defaults (handled above) - not
    // real SongVersion columns, so they're left out of this scalar update.
    const version = await this.prisma.client.songVersion.update({
      where: { id },
      data: {
        title: dto.title,
        alternateTitle: dto.alternateTitle,
        language: dto.language,
        ccli: dto.ccli,
        copyright: dto.copyright,
        copyrightYear: dto.copyrightYear,
        publisher: dto.publisher,
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
    await this.prisma.client.$transaction([
      this.prisma.client.songVersionIdentifier.upsert({
        where: { songVersionId_type: { songVersionId, type: "MUSICBRAINZ_RECORDING" } },
        create: {
          songVersionId,
          type: "MUSICBRAINZ_RECORDING",
          value: mbid,
          sourceUrl: match.sourceUrl,
          verifiedAt: new Date(),
        },
        update: { value: mbid, sourceUrl: match.sourceUrl, verifiedAt: new Date() },
      }),
      // A previous MusicBrainz link's own contributor row is marked
      // isAutoAttached so it can be replaced here without touching one a
      // user added by hand — re-linking to a different recording
      // shouldn't leave the old artist attached alongside the new one,
      // but a manually-entered composer/lyricist isn't this link's to
      // remove.
      this.prisma.client.versionContributor.deleteMany({ where: { songVersionId, isAutoAttached: true } }),
      ...(match.artist
        ? [
            this.prisma.client.versionContributor.create({
              data: { songVersionId, userId: null, source: match.artist, roles: ["PERFORMER"], isAutoAttached: true },
            }),
          ]
        : []),
    ]);
    return match;
  }

  async unlinkMusicBrainzRecording(songVersionId: string) {
    await this.prisma.client.$transaction([
      this.prisma.client.songVersionIdentifier.deleteMany({
        where: { songVersionId, type: "MUSICBRAINZ_RECORDING" },
      }),
      this.prisma.client.versionContributor.deleteMany({ where: { songVersionId, isAutoAttached: true } }),
    ]);
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

  async removeContributor(songVersionId: string, contributorId: string): Promise<void> {
    const deleted = await this.prisma.client.versionContributor.deleteMany({
      where: { id: contributorId, songVersionId },
    });
    if (deleted.count === 0) throw new NotFoundException("Contributor not found");
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
