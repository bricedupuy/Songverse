import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class WorksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists Works visible to the user: globally approved works, plus works
   * with at least one version owned by the user or one of their teams.
   * Phase 1 skeleton — no pagination/search yet (Phase 2/6).
   */
  async findVisibleToUser(userId: string) {
    const teamIds = (
      await this.prisma.client.teamMembership.findMany({
        where: { userId },
        select: { teamId: true },
      })
    ).map((m) => m.teamId);

    const works = await this.prisma.client.work.findMany({
      where: {
        versions: {
          some: {
            OR: [
              { ownerScope: "GLOBAL", publicationState: "APPROVED" },
              { ownerScope: "USER", ownerUserId: userId },
              { ownerScope: "TEAM", ownerTeamId: { in: teamIds } },
            ],
          },
        },
      },
      include: {
        preferredOriginalVersion: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return works.map((work) => ({
      id: work.id,
      preferredOriginalVersionId: work.preferredOriginalVersionId,
      title: work.preferredOriginalVersion?.title ?? null,
      createdAt: work.createdAt,
    }));
  }
}
