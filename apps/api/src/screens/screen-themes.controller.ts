import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, Res, UnauthorizedException, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiExcludeEndpoint, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CreateScreenThemeSchema, SCREEN_THEME_ASSET_KINDS, UpdateScreenThemeSchema, type ScreenThemeAssetKind } from "@songverse/core";
import type { Request, Response } from "express";
import { Public } from "../common/decorators/public.decorator.js";
import { UPLOAD_OPTIONS } from "../common/uploads.js";
import { RateLimit } from "../security/rate-limit.decorator.js";
import { SCREEN_THEME_ASSET_LIMITS } from "./screen-theme-assets.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { zodDto } from "../common/zod-validation.js";
import { ScreenThemesService } from "./screen-themes.service.js";

class CreateScreenThemeDto extends zodDto(CreateScreenThemeSchema) {}
class UpdateScreenThemeDto extends zodDto(UpdateScreenThemeSchema) {}

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw new UnauthorizedException();
  return user;
}

/** Screen themes (issue #194): saved looks for screens, a person's own or a team's. */
@ApiTags("screens")
@ApiBearerAuth()
@Controller("screen-themes")
export class ScreenThemesController {
  constructor(private readonly themes: ScreenThemesService) {}

  @Get()
  @ApiOperation({ summary: "The user's screen themes and their teams'", description: "Each with `canEdit`: theirs, or a team's they're an admin of." })
  list(@CurrentUser() user: AuthenticatedUser | undefined): ReturnType<ScreenThemesService["list"]> {
    return this.themes.list(requireUser(user));
  }

  @Post()
  @ApiOperation({ summary: "A screen theme", description: "The user's own, or with `teamId` a team's they're an admin of. `theme` is a screen-theme/v1 document (docs/screen-theme-v1.md)." })
  create(@Body() dto: CreateScreenThemeDto, @CurrentUser() user: AuthenticatedUser | undefined): ReturnType<ScreenThemesService["create"]> {
    return this.themes.create(requireUser(user), dto);
  }

  @Patch(":themeId")
  @ApiOperation({ summary: "Changes a screen theme", description: "The screens showing it change at once." })
  update(@Param("themeId") themeId: string, @Body() dto: UpdateScreenThemeDto, @CurrentUser() user: AuthenticatedUser | undefined): ReturnType<ScreenThemesService["update"]> {
    return this.themes.update(requireUser(user), themeId, dto);
  }

  /** A theme's file at its signed address (issue #194): a screen has no session. */
  @Public()
  @RateLimit("none")
  @Get("assets/:assetId")
  @ApiExcludeEndpoint()
  sendAsset(
    @Param("assetId") assetId: string,
    @Query("expires") expires: string | undefined,
    @Query("signature") signature: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.themes.sendAsset(assetId, expires, signature, req, res);
  }

  @RateLimit("heavy")
  @Post(":themeId/assets")
  @UseInterceptors(FileInterceptor("file", { ...UPLOAD_OPTIONS, limits: { fileSize: SCREEN_THEME_ASSET_LIMITS.video } }))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Adds a file to a screen theme",
    description: "`kind` media: a background picture (JPEG, PNG, WebP, AVIF, GIF, up to 15 MB) or looping video (MP4, WebM, up to 150 MB); font: WOFF2, WOFF, TTF or OTF (up to 5 MB). The theme's document then refers to it by its id.",
  })
  addAsset(
    @Param("themeId") themeId: string,
    @Query("kind") kind: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): ReturnType<ScreenThemesService["addAsset"]> {
    if (!file) throw new BadRequestException("A file is required");
    if (!(SCREEN_THEME_ASSET_KINDS as readonly string[]).includes(kind ?? "")) throw new BadRequestException("kind must be media or font");
    return this.themes.addAsset(requireUser(user), themeId, kind as ScreenThemeAssetKind, file);
  }

  @Delete(":themeId/assets/:assetId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAsset(@Param("themeId") themeId: string, @Param("assetId") assetId: string, @CurrentUser() user: AuthenticatedUser | undefined): Promise<void> {
    return this.themes.removeAsset(requireUser(user), themeId, assetId);
  }

  @Delete(":themeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Deletes a screen theme", description: "Its screens go back to the default look." })
  remove(@Param("themeId") themeId: string, @CurrentUser() user: AuthenticatedUser | undefined): Promise<void> {
    return this.themes.remove(requireUser(user), themeId);
  }
}
