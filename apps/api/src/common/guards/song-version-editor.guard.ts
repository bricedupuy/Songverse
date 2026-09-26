import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AccessPolicyService } from "../../access/access-policy.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedRequest } from "../types/authenticated-request";
import { stringParam } from "../utils/route-param";

/**
 * Lets through who may change the song version's chart, details and
 * credits (the route's `:songVersionId`): who can edit it, and someone
 * it's shared with to edit (issue #77) - see AccessPolicyService.canEditContent.
 * Deleting, publishing and sharing it stay with SongVersionOwnerGuard.
 */
@Injectable()
export class SongVersionEditorGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    const songVersionId = stringParam(request.params.songVersionId);
    if (!songVersionId) throw new ForbiddenException("Route is missing a songVersionId param");
    const song = await this.prisma.client.songVersion.findUnique({
      where: { id: songVersionId },
      select: { id: true, ownerScope: true, ownerUserId: true, ownerTeamId: true },
    });
    if (!song) throw new NotFoundException("Song version not found");
    if (await this.access.canEditContent(request.user, song)) return true;
    await this.access.assertCanEdit(request.user, song, "song version");
    return true;
  }
}
