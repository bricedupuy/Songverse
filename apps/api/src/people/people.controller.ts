import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { ConnectionRequestDto, ShareDto } from "./people.dto.js";
import { PeopleService } from "./people.service.js";

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw new UnauthorizedException();
  return user;
}

/** People, and sharing songs with them (issue #77). */
@ApiTags("people")
@ApiBearerAuth()
@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get("people")
  list(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.people.list(requireUser(user));
  }

  @Post("people/requests")
  request(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: ConnectionRequestDto) {
    return this.people.request(requireUser(user), dto);
  }

  @Post("people/requests/:id/accept")
  @HttpCode(HttpStatus.NO_CONTENT)
  accept(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string) {
    return this.people.answer(requireUser(user), id, true);
  }

  @Post("people/requests/:id/decline")
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string) {
    return this.people.answer(requireUser(user), id, false);
  }

  @Delete("people/requests/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string) {
    return this.people.cancel(requireUser(user), id);
  }

  @Delete("people/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser | undefined, @Param("userId") userId: string) {
    return this.people.remove(requireUser(user), userId);
  }

  /** Who the song is shared with (who manages it). */
  @Get("song-versions/:songVersionId/shares")
  async shares(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string) {
    await this.people.assertManages(requireUser(user), songVersionId);
    return this.people.shares(songVersionId);
  }

  @Put("song-versions/:songVersionId/shares/:userId")
  async share(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("songVersionId") songVersionId: string,
    @Param("userId") userId: string,
    @Body() dto: ShareDto,
  ) {
    const me = requireUser(user);
    await this.people.assertManages(me, songVersionId);
    return this.people.share(me, songVersionId, userId, dto.canEdit);
  }

  /** Stops sharing it with someone; `me`: someone it's shared with takes it out of their library. */
  @Delete("song-versions/:songVersionId/shares/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async unshare(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string, @Param("userId") userId: string) {
    const me = requireUser(user);
    if (userId === "me" || userId === me.id) {
      await this.people.leave(me, songVersionId);
      return;
    }
    await this.people.assertManages(me, songVersionId);
    await this.people.unshare(songVersionId, userId);
  }
}
