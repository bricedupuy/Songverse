import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SongbookOwnerGuard } from "../common/guards/songbook-owner.guard";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { AddSongbookEntryDto } from "./dto/add-songbook-entry.dto";
import { CreateSongbookDto } from "./dto/create-songbook.dto";
import { ImportSongbookFromCatalogDto } from "./dto/import-songbook-from-catalog.dto";
import { SongbookResponseDto } from "./dto/songbook-response.dto";
import { UpdateSongbookDto } from "./dto/update-songbook.dto";
import { SongbooksService } from "./songbooks.service";

@ApiTags("songbooks")
@ApiBearerAuth()
@Controller("songbooks")
export class SongbooksController {
  constructor(private readonly songbooksService: SongbooksService) {}

  @Get()
  @ApiOkResponse({ type: SongbookResponseDto, isArray: true })
  findAll(@CurrentUser() user?: AuthenticatedUser): ReturnType<SongbooksService["findVisibleToUser"]> {
    if (!user) throw new UnauthorizedException();
    return this.songbooksService.findVisibleToUser(user);
  }

  @Post()
  @ApiCreatedResponse({ type: SongbookResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateSongbookDto,
  ): ReturnType<SongbooksService["create"]> {
    if (!user) throw new UnauthorizedException();
    return this.songbooksService.create(user, dto);
  }

  @Post("import-from-catalog")
  @ApiCreatedResponse({ type: SongbookResponseDto })
  importFromCatalog(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: ImportSongbookFromCatalogDto,
  ): ReturnType<SongbooksService["importFromCatalog"]> {
    if (!user) throw new UnauthorizedException();
    return this.songbooksService.importFromCatalog(user, dto);
  }

  @Get(":songbookId")
  @ApiOkResponse({ type: SongbookResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("songbookId") songbookId: string,
  ): ReturnType<SongbooksService["findOne"]> {
    if (!user) throw new UnauthorizedException();
    return this.songbooksService.findOne(user, songbookId);
  }

  @Patch(":songbookId")
  @UseGuards(SongbookOwnerGuard)
  @ApiOkResponse({ type: SongbookResponseDto })
  update(
    @Param("songbookId") songbookId: string,
    @Body() dto: UpdateSongbookDto,
  ): ReturnType<SongbooksService["update"]> {
    return this.songbooksService.update(songbookId, dto);
  }

  @Delete(":songbookId")
  @UseGuards(SongbookOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("songbookId") songbookId: string): Promise<void> {
    return this.songbooksService.remove(songbookId);
  }

  @Post(":songbookId/entries")
  @UseGuards(SongbookOwnerGuard)
  addEntry(
    @Param("songbookId") songbookId: string,
    @Body() dto: AddSongbookEntryDto,
  ): ReturnType<SongbooksService["addEntry"]> {
    return this.songbooksService.addEntry(songbookId, dto);
  }

  @Delete(":songbookId/entries/:entryId")
  @UseGuards(SongbookOwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeEntry(@Param("songbookId") songbookId: string, @Param("entryId") entryId: string): Promise<void> {
    return this.songbooksService.removeEntry(songbookId, entryId);
  }

  @Post(":songbookId/catalog-entries/:catalogEntryId/materialize")
  @UseGuards(SongbookOwnerGuard)
  materializeEntry(
    @Param("songbookId") songbookId: string,
    @Param("catalogEntryId") catalogEntryId: string,
  ): ReturnType<SongbooksService["materializeEntry"]> {
    return this.songbooksService.materializeEntry(songbookId, catalogEntryId);
  }
}

/** Songbook entries by reference, for search (issue #48). */
@ApiTags("songbooks")
@ApiBearerAuth()
@Controller("songbook-entries")
export class SongbookEntriesController {
  constructor(private readonly songbooksService: SongbooksService) {}

  @Get()
  @ApiOperation({
    summary: "Songbook entries by reference",
    description:
      'Reads `q` as a songbook reference - "HY 42", "HY42", "Hymns 42", "42", "A-17" - and returns up to 8 matching entries in songbooks the user can see, whose songs they can see too. Empty when `q` has no number.',
  })
  @ApiQuery({ name: "q", required: true })
  search(@CurrentUser() user: AuthenticatedUser | undefined, @Query("q") q: string | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.songbooksService.searchEntries(user, q ?? "");
  }
}
