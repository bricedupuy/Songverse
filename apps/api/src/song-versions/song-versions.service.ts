import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { parseChordPro, parseSongDocument, type SongDocument } from "@songverse/core";
import type { Prisma } from "@songverse/db";
import { MusicBrainzService } from "../musicbrainz/musicbrainz.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import type { CreateSongVersionDto } from "./dto/create-song-version.dto";
import type { UpdateSongVersionDto } from "./dto/update-song-version.dto";

const LIST_SELECT = {
  id: true,
  workId: true,
  title: true,
  alternateTitle: true,
  language: true,
  ownerScope: true,
  publicationState: true,
  ccli: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  documentJson: true,
  contributors: {
    select: { id: true, userId: true, source: true, roles: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  },
} satisfies Prisma.SongVersionSelect;

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
  async findVisibleToUser(userId: string) {
    const teamIds = (
      await this.prisma.client.teamMembership.findMany({
        where: { userId },
        select: { teamId: true },
      })
    ).map((m) => m.teamId);

    return this.prisma.client.songVersion.findMany({
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
  }

  async findOne(id: string): Promise<Prisma.SongVersionGetPayload<{ select: typeof DETAIL_SELECT }>> {
    const version = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!version) throw new NotFoundException("Song version not found");
    return version;
  }

  /**
   * Creates a new Song Version. Without a `workId`, this also creates a
   * new Work with this version set as its preferred original — a Work
   * has no title of its own (it's just the grouping of versions of "the
   * same song"), so a version is the smallest thing a user can meaningfully
   * create on its own.
   */
  async create(user: AuthenticatedUser, dto: CreateSongVersionDto) {
    let ownerTeamId: string | null = null;
    if (dto.teamId) {
      const membership = await this.prisma.client.teamMembership.findUnique({
        where: { teamId_userId: { teamId: dto.teamId, userId: user.id } },
      });
      if (!membership) throw new ForbiddenException("Not a member of this team");
      ownerTeamId = dto.teamId;
    }
    const ownerScope = ownerTeamId ? "TEAM" : "USER";

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
      defaults: {},
      sections: [],
    });

    const versionData = {
      ownerScope,
      ownerUserId: ownerTeamId ? null : user.id,
      ownerTeamId,
      title: dto.title,
      alternateTitle: dto.alternateTitle,
      language: dto.language,
      copyright: dto.copyright,
      copyrightYear: dto.copyrightYear,
      publisher: dto.publisher,
      ccli: dto.ccli,
      documentJson: documentJson as object,
    } as const;

    if (dto.workId) {
      const work = await this.prisma.client.work.findUnique({ where: { id: dto.workId } });
      if (!work) throw new NotFoundException("Work not found");
      return this.prisma.client.songVersion.create({
        data: { ...versionData, workId: work.id },
        select: LIST_SELECT,
      });
    }

    return this.prisma.client.$transaction(async (tx) => {
      const work = await tx.work.create({ data: {} });
      const version = await tx.songVersion.create({
        data: { ...versionData, workId: work.id },
        select: LIST_SELECT,
      });
      await tx.work.update({
        where: { id: work.id },
        data: { preferredOriginalVersionId: version.id },
      });
      return version;
    });
  }

  /**
   * Partial update. Scalar SongVersion columns and documentJson.metadata
   * are kept in sync per the schema's own convention (see the ccli column
   * comment) — the editor will eventually read/write documentJson
   * directly, but until then these mirrored top-level columns are what
   * list/filter queries actually use.
   */
  async update(
    id: string,
    dto: UpdateSongVersionDto,
  ): Promise<Prisma.SongVersionGetPayload<{ select: typeof DETAIL_SELECT }>> {
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
    });

    return this.prisma.client.songVersion.update({
      where: { id },
      data: { ...dto, documentJson: documentJson as object },
      select: DETAIL_SELECT,
    });
  }

  /**
   * Replaces this version's content with the result of parsing pasted
   * ChordPro(-ish) text, leaving metadata untouched. chordproCache mirrors
   * the schema's own convention for that column ("Cached ChordPro export,
   * regenerated on save") - the pasted text already is one, so there's
   * nothing to re-serialize.
   */
  async importChordPro(
    id: string,
    content: string,
  ): Promise<Prisma.SongVersionGetPayload<{ select: typeof DETAIL_SELECT }>> {
    const existing = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: { documentJson: true },
    });
    if (!existing) throw new NotFoundException("Song version not found");

    const currentDoc = existing.documentJson as SongDocument;
    const documentJson: SongDocument = parseSongDocument({
      ...currentDoc,
      sections: parseChordPro(content),
    });

    return this.prisma.client.songVersion.update({
      where: { id },
      data: { documentJson: documentJson as object, chordproCache: content, chordproCacheAt: new Date() },
      select: DETAIL_SELECT,
    });
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
      // Every source-only (userId null) contributor on this version was
      // put there by a previous MusicBrainz link — replace rather than
      // accumulate, since re-linking to a different recording shouldn't
      // leave the old artist attached alongside the new one.
      this.prisma.client.versionContributor.deleteMany({ where: { songVersionId, userId: null } }),
      ...(match.artist
        ? [
            this.prisma.client.versionContributor.create({
              data: { songVersionId, userId: null, source: match.artist, roles: ["PERFORMER"] },
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
      this.prisma.client.versionContributor.deleteMany({ where: { songVersionId, userId: null } }),
    ]);
  }

  async getMusicBrainzInfo(songVersionId: string) {
    const identifier = await this.prisma.client.songVersionIdentifier.findUnique({
      where: { songVersionId_type: { songVersionId, type: "MUSICBRAINZ_RECORDING" } },
    });
    if (!identifier) return null;
    return this.musicBrainz.getRecording(identifier.value);
  }
}
