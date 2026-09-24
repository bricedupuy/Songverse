import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { requireUser } from "../setlists/setlists.controller";
import { ArrangementsService } from "./arrangements.service";
import { ChartPreferencesDto, CreateArrangementDto, UpdateArrangementDto } from "./dto/arrangement.dto";

/** Arrangements of a song, and a player's own chart preferences (docs/arrangement-document-v2.md). */
@ApiTags("arrangements")
@ApiBearerAuth()
@Controller()
export class ArrangementsController {
  constructor(private readonly arrangements: ArrangementsService) {}

  @Get("song-versions/:songVersionId/arrangements")
  list(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string) {
    return this.arrangements.listForSong(requireUser(user), songVersionId);
  }

  @Post("song-versions/:songVersionId/arrangements")
  create(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string, @Body() dto: CreateArrangementDto) {
    return this.arrangements.create(requireUser(user), songVersionId, dto);
  }

  @Get("arrangements/:id")
  findOne(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string) {
    return this.arrangements.findOne(requireUser(user), id);
  }

  @Patch("arrangements/:id")
  update(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string, @Body() dto: UpdateArrangementDto) {
    return this.arrangements.update(requireUser(user), id, dto);
  }

  @Post("arrangements/:id/reviewed")
  markReviewed(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string) {
    return this.arrangements.markReviewed(requireUser(user), id);
  }

  @Delete("arrangements/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string): Promise<void> {
    return this.arrangements.remove(requireUser(user), id);
  }

  @Get("chart-preferences")
  preferences(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query("songVersionId") songVersionId: string,
    @Query("arrangementId") arrangementId?: string,
  ) {
    return this.arrangements.preferencesForSong(requireUser(user), songVersionId, arrangementId || null);
  }

  @Put("chart-preferences")
  savePreferences(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: ChartPreferencesDto) {
    return this.arrangements.savePreferencesForSong(requireUser(user), dto.songVersionId, dto.arrangementId ?? null, dto.preferences);
  }
}
