import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard";
import { MetadataService } from "./metadata.service";

export class MetadataSearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  artist?: string;
}

export class MetadataProviderSettingDto {
  @IsString()
  @MaxLength(40)
  key!: string;

  /** What it's asked for (issue #89); left out, on. `enabled` is song info, as issue #22's lists said. */
  @IsOptional()
  @IsBoolean()
  songInfo?: boolean;

  @IsOptional()
  @IsBoolean()
  artwork?: boolean;

  @IsOptional()
  @IsBoolean()
  artistPictures?: boolean;

  @IsOptional()
  @IsBoolean()
  artistBios?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class SpotifyAppDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  market?: string;
}

export class MusicBrainzContactDto {
  @IsString()
  @MaxLength(200)
  contact!: string;
}

export class MetadataSettingsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MetadataProviderSettingDto)
  providers!: MetadataProviderSettingDto[];
}

export class AppleMusicKeyDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  teamId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  keyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  privateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  tokenUrl?: string;
}

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
