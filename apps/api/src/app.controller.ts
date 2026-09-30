import { Controller, Get } from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { Public } from "./common/decorators/public.decorator.js";
import { RateLimit } from "./security/rate-limit.decorator.js";

@Controller()
export class AppController {
  @Public()
  @RateLimit("none")
  @Get("health")
  @ApiExcludeEndpoint()
  health() {
    return { status: "ok" };
  }
}
