import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { LinkMusicBrainzDto } from "../musicbrainz/dto/link-musicbrainz.dto";
import { WorksService } from "./works.service";

@ApiTags("works")
@ApiBearerAuth()
@Controller("works")
export class WorksController {
  constructor(private readonly worksService: WorksService) {}

  @Get(":workId")
  findOne(@CurrentUser() user: AuthenticatedUser | undefined, @Param("workId") workId: string): ReturnType<WorksService["findOne"]> {
    if (!user) throw new UnauthorizedException();
    return this.worksService.findOne(user, workId);
  }

  @Post(":workId/musicbrainz-link")
  linkMusicBrainz(
    @Param("workId") workId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: LinkMusicBrainzDto,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.worksService.linkMusicBrainzWork(workId, user, dto.mbid);
  }

  @Delete(":workId/musicbrainz-link")
  @HttpCode(HttpStatus.NO_CONTENT)
  unlinkMusicBrainz(@Param("workId") workId: string, @CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.worksService.unlinkMusicBrainzWork(workId, user);
  }

  @Get(":workId/musicbrainz")
  getMusicBrainz(@CurrentUser() user: AuthenticatedUser | undefined, @Param("workId") workId: string) {
    if (!user) throw new UnauthorizedException();
    return this.worksService.getMusicBrainzInfo(user, workId);
  }
}
