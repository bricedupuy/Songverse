import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { ShareDto } from "../people/people.dto.js";
import { SongbookSharesService } from "./songbook-shares.service.js";

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw new UnauthorizedException();
  return user;
}

/** Who a songbook is shared with (issue #211): people and teams, to view or to edit. */
@ApiTags("songbooks")
@ApiBearerAuth()
@Controller("songbooks/:songbookId/shares")
export class SongbookSharesController {
  constructor(private readonly shares: SongbookSharesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songbookId") songbookId: string) {
    await this.shares.assertManages(requireUser(user), songbookId);
    return this.shares.list(songbookId);
  }

  @Put("users/:userId")
  shareWithUser(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songbookId") songbookId: string, @Param("userId") userId: string, @Body() dto: ShareDto) {
    return this.shares.shareWithUser(requireUser(user), songbookId, userId, dto.canEdit);
  }

  @Put("teams/:teamId")
  shareWithTeam(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songbookId") songbookId: string, @Param("teamId") teamId: string, @Body() dto: ShareDto) {
    return this.shares.shareWithTeam(requireUser(user), songbookId, teamId, dto.canEdit);
  }

  /** Stops sharing it with someone; `me`: someone it's shared with leaves it. */
  @Delete("users/:userId")
  @HttpCode(HttpStatus.OK)
  async unshareUser(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songbookId") songbookId: string, @Param("userId") userId: string) {
    const me = requireUser(user);
    if (userId === "me" || userId === me.id) {
      await this.shares.leave(me, songbookId);
      return [];
    }
    return this.shares.unshareUser(me, songbookId, userId);
  }

  @Delete("teams/:teamId")
  unshareTeam(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songbookId") songbookId: string, @Param("teamId") teamId: string) {
    return this.shares.unshareTeam(requireUser(user), songbookId, teamId);
  }
}
