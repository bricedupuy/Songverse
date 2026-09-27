import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { AccessPolicyService } from "../../access/access-policy.service.js";
import type { AuthenticatedRequest } from "../types/authenticated-request.js";
import { stringParam } from "../utils/route-param.js";

/**
 * Requires the authenticated user to be an ADMIN member of the team named by the route's
 * `:teamId` param. Global admins always pass.
 */
@Injectable()
export class TeamAdminGuard implements CanActivate {
  constructor(private readonly access: AccessPolicyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    if (request.user.isGlobalAdmin) return true;

    const teamId = stringParam(request.params.teamId);
    if (!teamId) {
      throw new ForbiddenException("Route is missing a teamId param");
    }
    const role = await this.access.teamRole(request.user.id, teamId);
    if (role !== "ADMIN") {
      throw new ForbiddenException("Team admin role required");
    }
    return true;
  }
}
