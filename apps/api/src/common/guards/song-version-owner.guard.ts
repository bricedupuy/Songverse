import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedRequest } from "../types/authenticated-request";
import { stringParam } from "../utils/route-param";

/**
 * Encodes the Song Version edit policy (spec §6):
 *   - GLOBAL scope  → global admins only
 *   - USER scope    → the owning user
 *   - TEAM scope    → admins of the owning team
 * Reads the target from the route's `:songVersionId` param.
 */
@Injectable()
export class SongVersionOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    if (request.user.isGlobalAdmin) return true;

    const songVersionId = stringParam(request.params.songVersionId);
    if (!songVersionId) {
      throw new ForbiddenException("Route is missing a songVersionId param");
    }

    const songVersion = await this.prisma.client.songVersion.findUnique({
      where: { id: songVersionId },
      select: { ownerScope: true, ownerUserId: true, ownerTeamId: true },
    });
    if (!songVersion) throw new NotFoundException("Song version not found");

    if (songVersion.ownerScope === "GLOBAL") {
      throw new ForbiddenException("Only global admins can edit a global song version");
    }

    if (songVersion.ownerScope === "USER") {
      if (songVersion.ownerUserId !== request.user.id) {
        throw new ForbiddenException("Not the owner of this song version");
      }
      return true;
    }

    // TEAM scope
    const membership = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId: songVersion.ownerTeamId!, userId: request.user.id } },
    });
    if (!membership || membership.role !== "ADMIN") {
      throw new ForbiddenException("Team admin role required to edit this song version");
    }
    return true;
  }
}
