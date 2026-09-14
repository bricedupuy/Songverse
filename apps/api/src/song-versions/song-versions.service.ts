import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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

@Injectable()
export class SongVersionsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
