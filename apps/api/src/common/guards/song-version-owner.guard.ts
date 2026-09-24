import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AccessPolicyService } from "../../access/access-policy.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedRequest } from "../types/authenticated-request";
import { stringParam } from "../utils/route-param";

/**
 * Lets through only who may change the song version named by the route's
 * `:songVersionId` param - see AccessPolicyService.canEdit.
 */
@Injectable()
export class SongVersionOwnerGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    const songVersionId = stringParam(request.params.songVersionId);
    if (!songVersionId) throw new ForbiddenException("Route is missing a songVersionId param");

    const songVersion = await this.prisma.client.songVersion.findUnique({
      where: { id: songVersionId },
      select: { ownerScope: true, ownerUserId: true, ownerTeamId: true },
    });
    if (!songVersion) throw new NotFoundException("Song version not found");
    await this.access.assertCanEdit(request.user, songVersion, "song version");
    return true;
  }
}
