import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { StreamingIdentifierType } from "@songverse/core";
import { AccessPolicyService } from "../access/access-policy.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SongVersionOwnerGuard } from "../common/guards/song-version-owner.guard";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { LinkMusicBrainzDto } from "../musicbrainz/dto/link-musicbrainz.dto";
import { CreateSongVersionDto } from "./dto/create-song-version.dto";
import { ListSongVersionsQueryDto } from "./dto/list-song-versions-query.dto";
import { SetStreamingLinkDto } from "./dto/set-streaming-link.dto";
import { SongVersionResponseDto, SongVersionSongbookMembershipDto } from "./dto/song-version-response.dto";
import { UpdateSongVersionDto } from "./dto/update-song-version.dto";
import { SongVersionsService } from "./song-versions.service";

const STREAMING_TYPES = new Set(["SPOTIFY", "APPLE_MUSIC", "YOUTUBE"]);

function asStreamingType(type: string): StreamingIdentifierType {
  if (!STREAMING_TYPES.has(type)) {
    throw new BadRequestException(`Unknown link type '${type}' — expected one of ${[...STREAMING_TYPES].join(", ")}`);
  }
  return type as StreamingIdentifierType;
}

@ApiTags("song-versions")
@ApiBearerAuth()
@Controller("song-versions")
export class SongVersionsController {
  constructor(
    private readonly songVersionsService: SongVersionsService,
    private readonly access: AccessPolicyService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: ListSongVersionsQueryDto,
  ): ReturnType<SongVersionsService["findVisibleToUser"]> {
    if (!user) throw new UnauthorizedException();
    return this.songVersionsService.findVisibleToUser(user, query);
  }

  /** How many songs and artists you can see. */
  @Get("stats")
  stats(@CurrentUser() user: AuthenticatedUser | undefined): ReturnType<SongVersionsService["statsForUser"]> {
    if (!user) throw new UnauthorizedException();
    return this.songVersionsService.statsForUser(user);
  }

  /** Names already credited on songs you can see, for autocomplete. */
  @Get("credits")
  searchCredits(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query("q") query: string | undefined,
  ): ReturnType<SongVersionsService["searchCredits"]> {
    if (!user) throw new UnauthorizedException();
    return this.songVersionsService.searchCredits(user, query ?? "");
  }

  /** Songs you can see with this title, grouped with their other versions. */
  @Get("matches")
  findMatches(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query("title") title: string | undefined,
  ): ReturnType<SongVersionsService["findMatches"]> {
    if (!user) throw new UnauthorizedException();
    return this.songVersionsService.findMatches(user, title ?? "");
  }

  @Get(":songVersionId")
  @ApiOkResponse({ type: SongVersionResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("songVersionId") songVersionId: string,
  ): ReturnType<SongVersionsService["findOne"]> {
    if (!user) throw new UnauthorizedException();
    return this.songVersionsService.findOne(user, songVersionId);
  }

  @Get(":songVersionId/songbooks")
  @ApiOkResponse({ type: SongVersionSongbookMembershipDto, isArray: true })
  async findSongbookMemberships(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("songVersionId") songVersionId: string,
  ): ReturnType<SongVersionsService["findSongbookMemberships"]> {
    if (!user) throw new UnauthorizedException();
    await this.access.assertCanSeeSong(user, songVersionId);
    return this.songVersionsService.findSongbookMemberships(user, songVersionId);
  }

  @Post()
  @ApiCreatedResponse({ type: SongVersionResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateSongVersionDto,
  ): ReturnType<SongVersionsService["create"]> {
    if (!user) throw new UnauthorizedException();
    return this.songVersionsService.create(user, dto);
  }

  @Patch(":songVersionId")
  @UseGuards(SongVersionOwnerGuard)
  @ApiOkResponse({ type: SongVersionResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("songVersionId") songVersionId: string,
    @Body() dto: UpdateSongVersionDto,
  ): ReturnType<SongVersionsService["update"]> {
    if (!user) throw new UnauthorizedException();
    return this.songVersionsService.update(user, songVersionId, dto);
  }

  @Delete(":songVersionId")
  @UseGuards(SongVersionOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("songVersionId") songVersionId: string) {
    return this.songVersionsService.remove(songVersionId);
  }

  @Get(":songVersionId/chordpro")
  async exportChordPro(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string) {
    if (!user) throw new UnauthorizedException();
    await this.access.assertCanSeeSong(user, songVersionId);
    return { content: await this.songVersionsService.exportChordPro(songVersionId) };
  }

  @Put(":songVersionId/links/:type")
  @UseGuards(SongVersionOwnerGuard)
  setStreamingLink(
    @Param("songVersionId") songVersionId: string,
    @Param("type") type: string,
    @Body() dto: SetStreamingLinkDto,
  ) {
    return this.songVersionsService.setStreamingLink(songVersionId, asStreamingType(type), dto.url);
  }

  @Delete(":songVersionId/links/:type")
  @UseGuards(SongVersionOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeStreamingLink(@Param("songVersionId") songVersionId: string, @Param("type") type: string) {
    return this.songVersionsService.removeStreamingLink(songVersionId, asStreamingType(type));
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
  async getMusicBrainz(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string) {
    if (!user) throw new UnauthorizedException();
    await this.access.assertCanSeeSong(user, songVersionId);
    return this.songVersionsService.getMusicBrainzInfo(songVersionId);
  }
}
