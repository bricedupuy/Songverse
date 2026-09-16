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
import { SongVersionOwnerGuard } from "../common/guards/song-version-owner.guard";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { LinkMusicBrainzDto } from "../musicbrainz/dto/link-musicbrainz.dto";
import { AddContributorDto } from "./dto/add-contributor.dto";
import { CreateSongVersionDto } from "./dto/create-song-version.dto";
import { ImportChordProDto } from "./dto/import-chordpro.dto";
import { SongVersionResponseDto } from "./dto/song-version-response.dto";
import { UpdateSongVersionDto } from "./dto/update-song-version.dto";
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

  @Patch(":songVersionId")
  @UseGuards(SongVersionOwnerGuard)
  @ApiOkResponse({ type: SongVersionResponseDto })
  update(
    @Param("songVersionId") songVersionId: string,
    @Body() dto: UpdateSongVersionDto,
  ): ReturnType<SongVersionsService["update"]> {
    return this.songVersionsService.update(songVersionId, dto);
  }

  @Delete(":songVersionId")
  @UseGuards(SongVersionOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("songVersionId") songVersionId: string) {
    return this.songVersionsService.remove(songVersionId);
  }

  @Post(":songVersionId/chordpro")
  @UseGuards(SongVersionOwnerGuard)
  @ApiOkResponse({ type: SongVersionResponseDto })
  importChordPro(
    @Param("songVersionId") songVersionId: string,
    @Body() dto: ImportChordProDto,
  ): ReturnType<SongVersionsService["importChordPro"]> {
    return this.songVersionsService.importChordPro(songVersionId, dto.content);
  }

  @Post(":songVersionId/contributors")
  @UseGuards(SongVersionOwnerGuard)
  addContributor(@Param("songVersionId") songVersionId: string, @Body() dto: AddContributorDto) {
    return this.songVersionsService.addContributor(songVersionId, dto.source, dto.roles);
  }

  @Delete(":songVersionId/contributors/:contributorId")
  @UseGuards(SongVersionOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeContributor(
    @Param("songVersionId") songVersionId: string,
    @Param("contributorId") contributorId: string,
  ) {
    return this.songVersionsService.removeContributor(songVersionId, contributorId);
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
