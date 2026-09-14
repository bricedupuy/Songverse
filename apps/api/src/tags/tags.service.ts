import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findCategories() {
    return this.prisma.client.tagCategory.findMany({
      orderBy: { sortOrder: "asc" },
    });
  }

  /**
   * Lists tags visible to the user: approved global tags, plus their own
   * private tags, plus their teams' private tags.
   */
  async findVisibleToUser(userId: string) {
    const teamIds = (
      await this.prisma.client.teamMembership.findMany({
        where: { userId },
        select: { teamId: true },
      })
    ).map((m) => m.teamId);

    return this.prisma.client.tag.findMany({
      where: {
        OR: [
          { scope: "GLOBAL", isApproved: true },
          { scope: "USER", ownerUserId: userId },
          { scope: "TEAM", ownerTeamId: { in: teamIds } },
        ],
      },
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }],
    });
  }
}
