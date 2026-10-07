import { Controller, Get, Param, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { ProgressionSearchQueryDto } from "./dto/progression-search-query.dto.js";
import { SongVersionsService } from "./song-versions.service.js";

/** Songs by chord progression (issue #204): searched, and alike. */
@ApiTags("progressions")
@ApiBearerAuth()
@Controller("progressions")
export class ProgressionsController {
  constructor(private readonly songs: SongVersionsService) {}

  /** The songs you can see whose chords go like `q` ("1 5 6m 4", "I V vi IV"), in any key. */
  @Get("search")
  search(@CurrentUser() user: AuthenticatedUser | undefined, @Query() query: ProgressionSearchQueryDto): ReturnType<SongVersionsService["searchProgressions"]> {
    if (!user) throw new UnauthorizedException();
    return this.songs.searchProgressions(user, query.q);
  }

  /** A song's progressions, and the songs you can see that move most like it. */
  @Get("songs/:songVersionId")
  ofSong(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string): ReturnType<SongVersionsService["progressionsOf"]> {
    if (!user) throw new UnauthorizedException();
    return this.songs.progressionsOf(user, songVersionId);
  }
}
