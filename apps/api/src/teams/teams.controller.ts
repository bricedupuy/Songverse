import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { TeamAdminGuard } from "../common/guards/team-admin.guard";
import { TeamMemberGuard } from "../common/guards/team-member.guard";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { CreateInviteLinkDto } from "./dto/create-invite-link.dto";
import { CreateTeamDto } from "./dto/create-team.dto";
import { InviteLinkResponseDto } from "./dto/invite-link-response.dto";
import { TeamMemberResponseDto } from "./dto/team-member-response.dto";
import { TeamResponseDto } from "./dto/team-response.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { TeamsService } from "./teams.service";

@ApiTags("teams")
@ApiBearerAuth()
@Controller("teams")
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOkResponse({ type: TeamResponseDto, isArray: true })
  findMyTeams(@CurrentUser() user?: AuthenticatedUser): ReturnType<TeamsService["findMyTeams"]> {
    if (!user) throw new UnauthorizedException();
    return this.teamsService.findMyTeams(user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: TeamResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateTeamDto,
  ): ReturnType<TeamsService["create"]> {
    if (!user) throw new UnauthorizedException();
    return this.teamsService.create(user.id, dto);
  }

  @Post("join/:token")
  @ApiCreatedResponse({ type: TeamResponseDto })
  joinByToken(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("token") token: string,
  ): ReturnType<TeamsService["joinByToken"]> {
    if (!user) throw new UnauthorizedException();
    return this.teamsService.joinByToken(user.id, token);
  }

  @Get(":teamId")
  @UseGuards(TeamMemberGuard)
  @ApiOkResponse({ type: TeamResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("teamId") teamId: string,
  ): ReturnType<TeamsService["findOne"]> {
    if (!user) throw new UnauthorizedException();
    return this.teamsService.findOne(user.id, teamId);
  }

  @Get(":teamId/members")
  @UseGuards(TeamMemberGuard)
  @ApiOkResponse({ type: TeamMemberResponseDto, isArray: true })
  listMembers(@Param("teamId") teamId: string): ReturnType<TeamsService["listMembers"]> {
    return this.teamsService.listMembers(teamId);
  }

  @Patch(":teamId/members/:memberUserId")
  @UseGuards(TeamAdminGuard)
  @ApiOkResponse({ type: TeamMemberResponseDto })
  updateMemberRole(
    @Param("teamId") teamId: string,
    @Param("memberUserId") memberUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): ReturnType<TeamsService["updateMemberRole"]> {
    return this.teamsService.updateMemberRole(teamId, memberUserId, dto.role);
  }

  @Delete(":teamId/members/:memberUserId")
  @UseGuards(TeamAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(@Param("teamId") teamId: string, @Param("memberUserId") memberUserId: string): Promise<void> {
    return this.teamsService.removeMember(teamId, memberUserId);
  }

  @Delete(":teamId")
  @UseGuards(TeamAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("teamId") teamId: string): Promise<void> {
    return this.teamsService.remove(teamId);
  }

  @Post(":teamId/leave")
  @UseGuards(TeamMemberGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@CurrentUser() user: AuthenticatedUser | undefined, @Param("teamId") teamId: string): Promise<void> {
    if (!user) throw new UnauthorizedException();
    return this.teamsService.leaveTeam(teamId, user.id);
  }

  @Get(":teamId/invite-links")
  @UseGuards(TeamAdminGuard)
  @ApiOkResponse({ type: InviteLinkResponseDto, isArray: true })
  listInviteLinks(@Param("teamId") teamId: string): ReturnType<TeamsService["listInviteLinks"]> {
    return this.teamsService.listInviteLinks(teamId);
  }

  @Post(":teamId/invite-links")
  @UseGuards(TeamAdminGuard)
  @ApiCreatedResponse({ type: InviteLinkResponseDto })
  createInviteLink(
    @Param("teamId") teamId: string,
    @Body() dto: CreateInviteLinkDto,
  ): ReturnType<TeamsService["createInviteLink"]> {
    return this.teamsService.createInviteLink(teamId, dto);
  }

  @Delete(":teamId/invite-links/:linkId")
  @UseGuards(TeamAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInviteLink(@Param("teamId") teamId: string, @Param("linkId") linkId: string): Promise<void> {
    return this.teamsService.revokeInviteLink(teamId, linkId);
  }
}
