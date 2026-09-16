import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SongVersionOwnerGuard } from "../common/guards/song-version-owner.guard";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { LinkMusicBrainzDto } from "../musicbrainz/dto/link-musicbrainz.dto";
import { CreateSongVersionDto } from "./dto/create-song-version.dto";
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

  @Get(":songVersionId")
  @ApiOkResponse({ type: SongVersionResponseDto })
  findOne(@Param("songVersionId") songVersionId: string): ReturnType<SongVersionsService["findOne"]> {
    return this.songVersionsService.findOne(songVersionId);
  }

  @Post()
  @ApiCreatedResponse({ type: SongVersionResponseDto })
  create(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: CreateSongVersionDto) {
    if (!user) throw new UnauthorizedException();
    return this.songVersionsService.create(user, dto);
  }

  @Post(":songVersionId/musicbrainz-link")
  @UseGuards(SongVersionOwnerGuard)
  linkMusicBrainz(@Param("songVersionId") songVersionId: string, @Body() dto: LinkMusicBrainzDto) {
    return this.songVersionsService.linkMusicBrainzRecording(songVersionId, dto.mbid);
  }

  @Delete(":songVersionId/musicbrainz-link")
  @UseGuards(SongVersionOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unlinkMusicBrainz(@Param("songVersionId") songVersionId: string) {
    return this.songVersionsService.unlinkMusicBrainzRecording(songVersionId);
  }

  @Get(":songVersionId/musicbrainz")
  getMusicBrainz(@Param("songVersionId") songVersionId: string) {
    return this.songVersionsService.getMusicBrainzInfo(songVersionId);
  }
}
