import { Controller, Get } from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { getEffectiveAuthSettings } from "./auth-settings";

/**
 * The one piece of auth config unauthenticated pages need to know: whether
 * to render the "Continue with Google" button (apps/web's auth-card.tsx).
 * Deliberately separate from AdminController's /admin/auth (which is
 * global-admin-only and returns the full config summary) - this endpoint
 * is public and returns nothing sensitive, not even a source indicator.
 */
@Controller("auth")
export class AuthConfigController {
  @Public()
  @Get("public-config")
  @ApiExcludeEndpoint()
  async publicConfig() {
    const settings = await getEffectiveAuthSettings();
    return { hasGoogleAuth: Boolean(settings.googleClientId && settings.googleClientSecret) };
  }
}
