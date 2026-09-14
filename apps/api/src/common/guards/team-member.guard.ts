import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedRequest } from "../types/authenticated-request";
import { stringParam } from "../utils/route-param";

/**
 * Requires the authenticated user to be a member (any role) of the team
 * named by the route's `:teamId` param. Global admins always pass.
 */
@Injectable()
export class TeamMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    if (request.user.isGlobalAdmin) return true;

    const teamId = stringParam(request.params.teamId);
    if (!teamId) {
      throw new ForbiddenException("Route is missing a teamId param");
    }

    const membership = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId: request.user.id } },
    });
    if (!membership) {
      throw new ForbiddenException("Not a member of this team");
    }
    return true;
  }
}
