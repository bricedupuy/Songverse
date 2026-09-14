import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest } from "../types/authenticated-request";

/** Requires the authenticated user to hold the global admin role. */
@Injectable()
export class GlobalAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    if (!request.user.isGlobalAdmin) {
      throw new ForbiddenException("Global admin role required");
    }
    return true;
  }
}
