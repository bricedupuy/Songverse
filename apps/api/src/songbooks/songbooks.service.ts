import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@songverse/db";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
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
  return {
    ...rest,
    entries: entries.map((entry) => ({
      id: entry.id,
      songVersionId: entry.songVersionId,
      entryCode: entry.entryCode,
      songVersionTitle: entry.songVersion.title,
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
    if (user.isGlobalAdmin || songbook.ownerScope === "GLOBAL") return;

    if (songbook.ownerScope === "USER") {
      if (songbook.ownerUserId !== user.id) throw new ForbiddenException("Not visible to you");
      return;
    }

    const membership = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId: songbook.ownerTeamId!, userId: user.id } },
    });
    if (!membership) throw new ForbiddenException("Not visible to you");
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
    return this.prisma.client.songbook.update({ where: { id: songbookId }, data: dto });
  }

  async remove(songbookId: string): Promise<void> {
    await this.prisma.client.songbook.delete({ where: { id: songbookId } });
  }

  async addEntry(songbookId: string, dto: AddSongbookEntryDto) {
    const songVersion = await this.prisma.client.songVersion.findUnique({
      where: { id: dto.songVersionId },
      select: { id: true, title: true },
    });
    if (!songVersion) throw new NotFoundException("Song version not found");

    const entry = await this.prisma.client.songbookEntry
      .create({
        data: { songbookId, songVersionId: dto.songVersionId, entryCode: dto.entryCode },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictException("This song is already in this songbook");
        }
        throw error;
      });
    return {
      id: entry.id,
      songVersionId: entry.songVersionId,
      entryCode: entry.entryCode,
      songVersionTitle: songVersion.title,
    };
  }

  async removeEntry(songbookId: string, entryId: string): Promise<void> {
    const entry = await this.prisma.client.songbookEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.songbookId !== songbookId) throw new NotFoundException("Entry not found");
    await this.prisma.client.songbookEntry.delete({ where: { id: entryId } });
  }
}
