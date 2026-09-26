import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Put, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";
import type { Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard";
import { SongVersionEditorGuard } from "../common/guards/song-version-editor.guard";
import { ArtworkService } from "./artwork.service";
import { isValidSongImageSignature } from "./song-image-url";

export class SetArtworkDto {
  @IsUrl({ protocols: ["https", "http"], require_tld: false })
  @MaxLength(2000)
  url!: string;
}

export class ArtworkSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}

/** Song images (issue #85): the image itself, choosing a song's artwork, and the admin's settings. */
@ApiTags("artwork")
@ApiBearerAuth()
@Controller()
export class ArtworkController {
  constructor(private readonly artwork: ArtworkService) {}

  /** The image, at a signed address handed out with the song (see song-image-url.ts); `w` snaps to a set of widths. */
  @Public()
  @Get("song-versions/:songVersionId/image/:key")
  @ApiExcludeEndpoint()
  async image(
    @Param("songVersionId") songVersionId: string,
    @Param("key") key: string,
    @Query("expires") expires: string | undefined,
    @Query("signature") signature: string | undefined,
    @Query("w") width: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!isValidSongImageSignature(songVersionId, key, expires, signature)) throw new ForbiddenException("This image address has expired");
    const { body, contentType } = await this.artwork.image(songVersionId, key, width ? Number(width) : 800);
    res.set({
      "Content-Type": contentType,
      // Its key is its content: the same address always has the same image.
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      // Shown as an <img> by the web app, on another origin.
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    return new StreamableFile(body);
  }

  /** Apple Music's matches for the song, to choose its artwork from. */
  @Get("song-versions/:songVersionId/artwork/candidates")
  @UseGuards(SongVersionEditorGuard)
  candidates(@Param("songVersionId") songVersionId: string) {
    return this.artwork.candidatesFor(songVersionId);
  }

  @Put("song-versions/:songVersionId/artwork")
  @UseGuards(SongVersionEditorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(@Param("songVersionId") songVersionId: string, @Body() dto: SetArtworkDto): Promise<void> {
    await this.artwork.setFromUrl(songVersionId, dto.url);
  }

  @Delete("song-versions/:songVersionId/artwork")
  @UseGuards(SongVersionEditorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@Param("songVersionId") songVersionId: string): Promise<void> {
    await this.artwork.clear(songVersionId);
  }

  @Get("admin/artwork")
  @UseGuards(GlobalAdminGuard)
  settings() {
    return this.artwork.settings();
  }

  @Put("admin/artwork")
  @UseGuards(GlobalAdminGuard)
  save(@Body() dto: ArtworkSettingsDto) {
    return this.artwork.saveSettings(dto);
  }

  @Delete("admin/artwork")
  @UseGuards(GlobalAdminGuard)
  reset() {
    return this.artwork.resetSettings();
  }

  /** Finds artwork for up to 50 songs without an image. */
  @Post("admin/artwork/backfill")
  @UseGuards(GlobalAdminGuard)
  async backfill() {
    if (!(await this.artwork.settings()).enabled) throw new NotFoundException("Artwork is turned off");
    return this.artwork.backfill();
  }
}
