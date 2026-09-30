import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.js";
import { RateLimit } from "./rate-limit.decorator.js";
import { getEffectiveSecuritySettings } from "./security-settings.js";

/** What the web app's server asks of Admin > Security (issue #114): whether to enforce its Content-Security-Policy. */
@ApiExcludeController()
@Controller("security")
export class SecurityController {
  @Public()
  @RateLimit("none")
  @Get("web")
  async web(): Promise<{ contentSecurityPolicy: "ENFORCE" | "REPORT_ONLY" | "OFF" }> {
    return { contentSecurityPolicy: (await getEffectiveSecuritySettings()).contentSecurityPolicy };
  }
}
