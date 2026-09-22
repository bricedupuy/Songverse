import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard";
import { CatalogEntryResponseDto, CatalogResponseDto, ImportCatalogCsvResultDto } from "./dto/catalog-response.dto";
import { CreateCatalogEntryDto } from "./dto/create-catalog-entry.dto";
import { CreateCatalogDto } from "./dto/create-catalog.dto";
import { ImportCatalogCsvDto } from "./dto/import-catalog-csv.dto";
import { UpdateCatalogEntryDto } from "./dto/update-catalog-entry.dto";
import { UpdateCatalogDto } from "./dto/update-catalog.dto";
import type { ImportCsvResult } from "./songbook-catalog.service";
import { SongbookCatalogService } from "./songbook-catalog.service";

@ApiTags("songbook-catalog")
@ApiBearerAuth()
@Controller("songbook-catalogs")
export class SongbookCatalogController {
  constructor(private readonly catalogService: SongbookCatalogService) {}

  @Get()
  @ApiOkResponse({ type: CatalogResponseDto, isArray: true })
  findAll(): ReturnType<SongbookCatalogService["findAll"]> {
    return this.catalogService.findAll();
  }

  @Get(":catalogId")
  @ApiOkResponse({ type: CatalogResponseDto })
  findOne(@Param("catalogId") catalogId: string): ReturnType<SongbookCatalogService["findOne"]> {
    return this.catalogService.findOne(catalogId);
  }

  @Post()
  @UseGuards(GlobalAdminGuard)
  @ApiCreatedResponse({ type: CatalogResponseDto })
  create(@Body() dto: CreateCatalogDto): ReturnType<SongbookCatalogService["create"]> {
    return this.catalogService.create(dto);
  }

  @Patch(":catalogId")
  @UseGuards(GlobalAdminGuard)
  @ApiOkResponse({ type: CatalogResponseDto })
  update(
    @Param("catalogId") catalogId: string,
    @Body() dto: UpdateCatalogDto,
  ): ReturnType<SongbookCatalogService["update"]> {
    return this.catalogService.update(catalogId, dto);
  }

  @Delete(":catalogId")
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("catalogId") catalogId: string): Promise<void> {
    return this.catalogService.remove(catalogId);
  }

  @Post(":catalogId/entries")
  @UseGuards(GlobalAdminGuard)
  @ApiCreatedResponse({ type: CatalogEntryResponseDto })
  addEntry(
    @Param("catalogId") catalogId: string,
    @Body() dto: CreateCatalogEntryDto,
  ): ReturnType<SongbookCatalogService["addEntry"]> {
    return this.catalogService.addEntry(catalogId, dto);
  }

  @Patch(":catalogId/entries/:entryId")
  @UseGuards(GlobalAdminGuard)
  @ApiOkResponse({ type: CatalogEntryResponseDto })
  updateEntry(
    @Param("catalogId") catalogId: string,
    @Param("entryId") entryId: string,
    @Body() dto: UpdateCatalogEntryDto,
  ): ReturnType<SongbookCatalogService["updateEntry"]> {
    return this.catalogService.updateEntry(catalogId, entryId, dto);
  }

  @Delete(":catalogId/entries/:entryId")
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeEntry(@Param("catalogId") catalogId: string, @Param("entryId") entryId: string): Promise<void> {
    return this.catalogService.removeEntry(catalogId, entryId);
  }

  @Post(":catalogId/entries/import-csv")
  @UseGuards(GlobalAdminGuard)
  @ApiOkResponse({ type: ImportCatalogCsvResultDto })
  importCsv(@Param("catalogId") catalogId: string, @Body() dto: ImportCatalogCsvDto): Promise<ImportCsvResult> {
    return this.catalogService.importCsv(catalogId, dto.csv);
  }
}
