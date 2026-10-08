import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AccessPolicyService } from "../../access/access-policy.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { AuthenticatedRequest } from "../types/authenticated-request.js";
import { stringParam } from "../utils/route-param.js";

/**
 * Lets through only the owner of the songbook named by the route's
 * `:songbookId` param (its owner, its team's admins - AccessPolicyService.
 * canEdit), not someone it's shared with to edit (issue #211): for what
 * writes into the owner's songs, as a bulk upload does.
 */
@Injectable()
export class SongbookManagerGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    const songbookId = stringParam(request.params.songbookId);
    if (!songbookId) throw new ForbiddenException("Route is missing a songbookId param");
    const songbook = await this.prisma.client.songbook.findUnique({ where: { id: songbookId }, select: { ownerScope: true, ownerUserId: true, ownerTeamId: true } });
    if (!songbook) throw new NotFoundException("Songbook not found");
    await this.access.assertCanEdit(request.user, songbook, "songbook");
    return true;
  }
}
