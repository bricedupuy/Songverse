import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AppleMusicKeySchema, MetadataSearchQuerySchema, MetadataSettingsSchema, MusicBrainzContactSchema, SpotifyAppSchema } from "@songverse/core";
import { zodDto } from "../common/zod-validation.js";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard.js";
import { MetadataService } from "./metadata.service.js";

export class MetadataSearchQueryDto extends zodDto(MetadataSearchQuerySchema) {}

export class SpotifyAppDto extends zodDto(SpotifyAppSchema) {}

export class MusicBrainzContactDto extends zodDto(MusicBrainzContactSchema) {}

export class MetadataSettingsDto extends zodDto(MetadataSettingsSchema) {}

export class AppleMusicKeyDto extends zodDto(AppleMusicKeySchema) {}

/**
 * Metadata providers (issue #22): Auto detect's search - read only, like
 * the MusicBrainz proxy; linking a match goes through the song's own
 * endpoint, which checks edit rights - and the admin's settings.
 */
@ApiTags("metadata")
@ApiBearerAuth()
@Controller()
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get("metadata/search")
  search(@Query() query: MetadataSearchQueryDto) {
    return this.metadata.search(query.title, query.artist);
  }

  @Get("admin/metadata")
  @UseGuards(GlobalAdminGuard)
  settings() {
    return this.metadata.settings();
  }

  @Put("admin/metadata")
  @UseGuards(GlobalAdminGuard)
  save(@Body() dto: MetadataSettingsDto) {
    return this.metadata.saveSettings(dto.providers);
  }

  @Delete("admin/metadata")
  @UseGuards(GlobalAdminGuard)
  reset() {
    return this.metadata.resetSettings();
  }

  /** The Apple Music API's MusicKit key (issue #87). */
  @Put("admin/metadata/apple-music")
  @UseGuards(GlobalAdminGuard)
  saveAppleMusic(@Body() dto: AppleMusicKeyDto) {
    return this.metadata.saveAppleMusic(dto);
  }

  @Delete("admin/metadata/apple-music")
  @UseGuards(GlobalAdminGuard)
  resetAppleMusic() {
    return this.metadata.resetAppleMusic();
  }

  @Post("admin/metadata/apple-music/test")
  @UseGuards(GlobalAdminGuard)
  testAppleMusic() {
    return this.metadata.testAppleMusic();
  }

  /** Spotify's developer app (issue #89). */
  @Put("admin/metadata/spotify")
  @UseGuards(GlobalAdminGuard)
  saveSpotify(@Body() dto: SpotifyAppDto) {
    return this.metadata.saveSpotify(dto);
  }

  @Delete("admin/metadata/spotify")
  @UseGuards(GlobalAdminGuard)
  resetSpotify() {
    return this.metadata.resetSpotify();
  }

  @Post("admin/metadata/spotify/test")
  @UseGuards(GlobalAdminGuard)
  testSpotify() {
    return this.metadata.testSpotify();
  }

  /** MusicBrainz's contact, in the User-Agent (issue #89); empty goes back to MUSICBRAINZ_CONTACT. */
  @Put("admin/metadata/musicbrainz")
  @UseGuards(GlobalAdminGuard)
  saveMusicBrainz(@Body() dto: MusicBrainzContactDto) {
    return this.metadata.saveMusicBrainz(dto.contact);
  }
}
