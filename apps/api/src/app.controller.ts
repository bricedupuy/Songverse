import { Controller, Get } from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { Public } from "./common/decorators/public.decorator.js";

@Controller()
export class AppController {
  @Public()
  @Get("health")
  @ApiExcludeEndpoint()
  health() {
    return { status: "ok" };
  }
}
