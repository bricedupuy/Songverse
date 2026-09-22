import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedRequest } from "../types/authenticated-request";
import { stringParam } from "../utils/route-param";

/**
 * Same ownership policy as SongVersionOwnerGuard, applied to Songbook:
 *   - GLOBAL scope  → global admins only
 *   - USER scope    → the owning user
 *   - TEAM scope    → admins of the owning team
 * Reads the target from the route's `:songbookId` param.
 */
@Injectable()
export class SongbookOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    if (request.user.isGlobalAdmin) return true;

    const songbookId = stringParam(request.params.songbookId);
    if (!songbookId) {
      throw new ForbiddenException("Route is missing a songbookId param");
    }

    const songbook = await this.prisma.client.songbook.findUnique({
      where: { id: songbookId },
      select: { ownerScope: true, ownerUserId: true, ownerTeamId: true },
    });
    if (!songbook) throw new NotFoundException("Songbook not found");

    if (songbook.ownerScope === "GLOBAL") {
      throw new ForbiddenException("Only global admins can edit a global songbook");
    }

    if (songbook.ownerScope === "USER") {
      if (songbook.ownerUserId !== request.user.id) {
        throw new ForbiddenException("Not the owner of this songbook");
      }
      return true;
    }

    // TEAM scope
    const membership = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId: songbook.ownerTeamId!, userId: request.user.id } },
    });
    if (!membership || membership.role !== "ADMIN") {
      throw new ForbiddenException("Team admin role required to edit this songbook");
    }
    return true;
  }
}
