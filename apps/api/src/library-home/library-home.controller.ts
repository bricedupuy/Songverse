import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AccessPolicyService } from "../access/access-policy.service.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { LibraryHomeService } from "./library-home.service.js";

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw new UnauthorizedException();
  return user;
}

/** The Library's home, favorites and views (issue #81). */
@ApiTags("library")
@ApiBearerAuth()
@Controller()
export class LibraryHomeController {
  constructor(
    private readonly home: LibraryHomeService,
    private readonly access: AccessPolicyService,
  ) {}

  /** The shelves: newly added, recently viewed, favorites, popular in your teams. */
  @Get("library/home")
  get(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.home.home(requireUser(user));
  }

  /** The user opened the song. */
  @Post("song-versions/:songVersionId/views")
  @HttpCode(HttpStatus.NO_CONTENT)
  async view(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string) {
    const me = requireUser(user);
    await this.access.assertCanSeeSong(me, songVersionId);
    await this.home.view(me, songVersionId);
  }

  @Put("song-versions/:songVersionId/favorite")
  @HttpCode(HttpStatus.NO_CONTENT)
  async favorite(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string) {
    const me = requireUser(user);
    await this.access.assertCanSeeSong(me, songVersionId);
    await this.home.favorite(me, songVersionId, true);
  }

  @Delete("song-versions/:songVersionId/favorite")
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfavorite(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string) {
    await this.home.favorite(requireUser(user), songVersionId, false);
  }
}
