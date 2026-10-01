import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Post, Put, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { SaveStemSeparationSettingsSchema, StartStemSeparationSchema } from "@songverse/core";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Public } from "../common/decorators/public.decorator.js";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { zodDto } from "../common/zod-validation.js";
import { RateLimit } from "../security/rate-limit.decorator.js";
import { testDemucs } from "./demucs-client.js";
import { StemSeparationService } from "./stem-separation.service.js";
import { clearStemSeparationSettings, getEffectiveStemSeparationSettings, getStemSeparationSummary, saveStemSeparationSettings } from "./stem-separation-settings.js";

class StartStemSeparationDto extends zodDto(StartStemSeparationSchema) {}
class SaveStemSeparationSettingsDto extends zodDto(SaveStemSeparationSettingsSchema) {}

/** Where the Demucs API's webhooks come: this API's own address (AUTH_URL); null without one (then the Worker only polls). */
function callbackUrl(): string | null {
  const own = process.env.AUTH_URL?.replace(/\/+$/, "");
  return own ? `${own}/stem-separation/callback` : null;
}

/** Splitting a song's recordings into stems (issue #63). */
@ApiTags("stem-separation")
@ApiBearerAuth()
@Controller()
export class StemSeparationController {
  constructor(private readonly separations: StemSeparationService) {}

  @Get("song-versions/:songVersionId/stem-separations")
  @ApiOkResponse({ description: "Whether the viewer may split the song's recordings (or why not), and its separations: theirs, or all for who may." })
  list(@Param("songVersionId") songVersionId: string, @CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.separations.list(user, songVersionId);
  }

  @RateLimit("heavy")
  @Post("song-versions/:songVersionId/attachments/:attachmentId/separate")
  start(@Param("songVersionId") songVersionId: string, @Param("attachmentId") attachmentId: string, @Body() dto: StartStemSeparationDto, @CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.separations.start(user, songVersionId, attachmentId, dto.parts, callbackUrl(), dto.replace ?? false);
  }

  @RateLimit("heavy")
  @Post("stem-separations/:separationId/retry")
  @HttpCode(HttpStatus.NO_CONTENT)
  retry(@Param("separationId") separationId: string, @CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.separations.retry(user, separationId, callbackUrl());
  }

  /** The Demucs API's signed webhook (X-Demucs-Signature over the raw body). */
  @Public()
  @RateLimit("none")
  @ApiExcludeEndpoint()
  @Post("stem-separation/callback")
  @HttpCode(HttpStatus.NO_CONTENT)
  callback(@Req() req: Request & { rawBody?: Buffer }, @Headers("x-demucs-signature") signature: string | undefined) {
    return this.separations.callback(req.rawBody, signature);
  }
}

/** Admin > Stem separation (issue #63): the Demucs API's settings and a test. Who may use it is a role (issue #160). */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/stem-separation")
@UseGuards(GlobalAdminGuard)
export class AdminStemSeparationController {
  @Get()
  get(): ReturnType<typeof getStemSeparationSummary> {
    return getStemSeparationSummary();
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  save(@Body() dto: SaveStemSeparationSettingsDto): Promise<void> {
    return saveStemSeparationSettings(dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(): Promise<void> {
    return clearStemSeparationSettings();
  }

  /** Its health check and what it offers, with the saved key. */
  @Post("test")
  @HttpCode(HttpStatus.OK)
  async test() {
    try {
      return { ok: true as const, ...(await testDemucs(await getEffectiveStemSeparationSettings())) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
