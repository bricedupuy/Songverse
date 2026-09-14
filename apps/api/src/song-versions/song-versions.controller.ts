import { Controller, Get, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { SongVersionResponseDto } from "./dto/song-version-response.dto";
import { SongVersionsService } from "./song-versions.service";

@ApiTags("song-versions")
@ApiBearerAuth()
@Controller("song-versions")
export class SongVersionsController {
  constructor(private readonly songVersionsService: SongVersionsService) {}

  @Get()
  @ApiOkResponse({ type: SongVersionResponseDto, isArray: true })
  findAll(@CurrentUser() user?: AuthenticatedUser) {
    if (!user) throw new UnauthorizedException();
    return this.songVersionsService.findVisibleToUser(user.id);
  }
}
