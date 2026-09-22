import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SongbookOwnerGuard } from "../common/guards/songbook-owner.guard";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { AddSongbookEntryDto } from "./dto/add-songbook-entry.dto";
import { CreateSongbookDto } from "./dto/create-songbook.dto";
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
}
