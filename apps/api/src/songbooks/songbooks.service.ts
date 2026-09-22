import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { computeSectionLabel, validateSongbookSections, type SongbookSection } from "@songverse/core";
import { Prisma } from "@songverse/db";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { isOwnedByOrMemberOf } from "../common/utils/ownership-visibility";
import type { AddSongbookEntryDto } from "./dto/add-songbook-entry.dto";
import type { CreateSongbookDto } from "./dto/create-songbook.dto";
import type { UpdateSongbookDto } from "./dto/update-songbook.dto";

const DETAIL_INCLUDE = {
  entries: {
    include: { songVersion: { select: { title: true } } },
    orderBy: { entryCode: "asc" as const },
  },
} satisfies Prisma.SongbookInclude;

type SongbookWithEntries = Prisma.SongbookGetPayload<{ include: typeof DETAIL_INCLUDE }>;

function toDetail(songbook: SongbookWithEntries) {
  const { entries, ...rest } = songbook;
  const sections = (songbook.sections as SongbookSection[] | null) ?? null;
  return {
    ...rest,
    sections,
    entries: entries.map((entry) => ({
      id: entry.id,
      songVersionId: entry.songVersionId,
      entryCode: entry.entryCode,
      songVersionTitle: entry.songVersion.title,
      sectionLabel: computeSectionLabel(entry.entryCode, sections),
    })),
  };
}

@Injectable()
export class SongbooksService {
  constructor(private readonly prisma: PrismaService) {}

  async findVisibleToUser(user: AuthenticatedUser): Promise<Prisma.SongbookGetPayload<object>[]> {
    if (user.isGlobalAdmin) {
      return this.prisma.client.songbook.findMany({ orderBy: { name: "asc" } });
    }

    const teamIds = (
      await this.prisma.client.teamMembership.findMany({
        where: { userId: user.id },
        select: { teamId: true },
      })
    ).map((m) => m.teamId);

    return this.prisma.client.songbook.findMany({
      where: {
        OR: [
          { ownerScope: "GLOBAL" },
          { ownerScope: "USER", ownerUserId: user.id },
          { ownerScope: "TEAM", ownerTeamId: { in: teamIds } },
        ],
      },
      orderBy: { name: "asc" },
    });
  }

  async findOne(user: AuthenticatedUser, songbookId: string) {
    const songbook = await this.prisma.client.songbook.findUnique({
      where: { id: songbookId },
      include: DETAIL_INCLUDE,
    });
    if (!songbook) throw new NotFoundException("Songbook not found");
    await this.assertVisible(user, songbook);
    return toDetail(songbook);
  }

  private async assertVisible(
    user: AuthenticatedUser,
    songbook: { ownerScope: string; ownerUserId: string | null; ownerTeamId: string | null },
  ): Promise<void> {
    if (songbook.ownerScope === "GLOBAL") return;
    if (!(await isOwnedByOrMemberOf(this.prisma, user, songbook))) {
      throw new ForbiddenException("Not visible to you");
    }
  }

  async create(user: AuthenticatedUser, dto: CreateSongbookDto): Promise<Prisma.SongbookGetPayload<object>> {
    let ownerScope: "GLOBAL" | "TEAM" | "USER" = "USER";
    let ownerTeamId: string | null = null;
    let ownerUserId: string | null = user.id;

    if (dto.global) {
      if (!user.isGlobalAdmin) throw new ForbiddenException("Only global admins can create a global songbook");
      ownerScope = "GLOBAL";
      ownerUserId = null;
    } else if (dto.teamId) {
      const membership = await this.prisma.client.teamMembership.findUnique({
        where: { teamId_userId: { teamId: dto.teamId, userId: user.id } },
      });
      if (!membership) throw new ForbiddenException("Not a member of this team");
      ownerScope = "TEAM";
      ownerTeamId = dto.teamId;
      ownerUserId = null;
    }

    return this.prisma.client.songbook.create({
      data: {
        name: dto.name,
        kind: dto.kind,
        abbreviation: dto.abbreviation,
        language: dto.language,
        publisher: dto.publisher,
        year: dto.year,
        ownerScope,
        ownerUserId,
        ownerTeamId,
      },
    });
  }

  update(songbookId: string, dto: UpdateSongbookDto): Promise<Prisma.SongbookGetPayload<object>> {
    let sections: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
    if (dto.sections !== undefined) {
      try {
        sections = validateSongbookSections(dto.sections) as unknown as Prisma.InputJsonValue;
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : String(error));
      }
    }

    return this.prisma.client.songbook.update({
      where: { id: songbookId },
      data: { ...dto, sections },
    });
  }

  async remove(songbookId: string): Promise<void> {
    await this.prisma.client.songbook.delete({ where: { id: songbookId } });
  }

  async addEntry(songbookId: string, dto: AddSongbookEntryDto) {
    const songbook = await this.prisma.client.songbook.findUnique({
      where: { id: songbookId },
      select: { kind: true, sections: true },
    });
    if (!songbook) throw new NotFoundException("Songbook not found");
    if (songbook.kind === "NUMBERED" && !dto.entryCode) {
      throw new BadRequestException("entryCode is required for a NUMBERED songbook");
    }
    const entryCode = songbook.kind === "NUMBERED" ? dto.entryCode! : null;

    const songVersion = await this.prisma.client.songVersion.findUnique({
      where: { id: dto.songVersionId },
      select: { id: true, title: true },
    });
    if (!songVersion) throw new NotFoundException("Song version not found");

    const entry = await this.prisma.client.songbookEntry
      .create({
        data: { songbookId, songVersionId: dto.songVersionId, entryCode },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictException("This song is already in this songbook, or its number is already taken");
        }
        throw error;
      });
    return {
      id: entry.id,
      songVersionId: entry.songVersionId,
      entryCode: entry.entryCode,
      songVersionTitle: songVersion.title,
      sectionLabel: computeSectionLabel(entry.entryCode, songbook.sections as SongbookSection[] | null),
    };
  }

  async removeEntry(songbookId: string, entryId: string): Promise<void> {
    const entry = await this.prisma.client.songbookEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.songbookId !== songbookId) throw new NotFoundException("Entry not found");
    await this.prisma.client.songbookEntry.delete({ where: { id: entryId } });
  }
}
