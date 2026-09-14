import { Controller, Get, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { WorkResponseDto } from "./dto/work-response.dto";
import { WorksService } from "./works.service";

@ApiTags("works")
@ApiBearerAuth()
@Controller("works")
export class WorksController {
  constructor(private readonly worksService: WorksService) {}

  @Get()
  @ApiOkResponse({ type: WorkResponseDto, isArray: true })
  findAll(@CurrentUser() user?: AuthenticatedUser) {
    if (!user) throw new UnauthorizedException();
    return this.worksService.findVisibleToUser(user.id);
  }
}
