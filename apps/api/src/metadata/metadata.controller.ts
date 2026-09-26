import { Body, Controller, Delete, Get, Put, Query, UseGuards } from "@nestjs/common";
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

  @IsBoolean()
  enabled!: boolean;
}

export class MetadataSettingsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MetadataProviderSettingDto)
  providers!: MetadataProviderSettingDto[];
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
}
