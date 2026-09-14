import { Body, Controller, Get, Post, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateTeamDto } from "./dto/create-team.dto";
import { TeamResponseDto } from "./dto/team-response.dto";
import { TeamsService } from "./teams.service";

@ApiTags("teams")
@ApiBearerAuth()
@Controller("teams")
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOkResponse({ type: TeamResponseDto, isArray: true })
  findMyTeams(@CurrentUser() user?: AuthenticatedUser) {
    if (!user) throw new UnauthorizedException();
    return this.teamsService.findMyTeams(user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: TeamResponseDto })
  create(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: CreateTeamDto) {
    if (!user) throw new UnauthorizedException();
    return this.teamsService.create(user.id, dto);
  }
}
