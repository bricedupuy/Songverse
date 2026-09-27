import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard.js";
import { CatalogEntryInputDto } from "./dto/catalog-entry-input.dto.js";
import { CatalogEntryResponseDto, CatalogResponseDto, ImportCatalogResultDto } from "./dto/catalog-response.dto.js";
import { CreateCatalogDto } from "./dto/create-catalog.dto.js";
import { CatalogFileDto, ImportCatalogEntriesDto } from "./dto/import-catalog-file.dto.js";
import { UpdateCatalogDto } from "./dto/update-catalog.dto.js";
import { SongbookCatalogService } from "./songbook-catalog.service.js";

/** Reading is open to everyone signed in; changes are global-admin-only. File format: docs/songbook-catalog-format.md. */
@ApiTags("songbook-catalog")
@ApiBearerAuth()
@Controller("songbook-catalogs")
export class SongbookCatalogController {
  constructor(private readonly catalogService: SongbookCatalogService) {}

  @Get()
  @ApiOkResponse({ type: CatalogResponseDto, isArray: true })
  findAll() {
    return this.catalogService.findAll();
  }

  /** Creates a catalogue, details and entries, from a JSON export. */
  @Post("import")
  @UseGuards(GlobalAdminGuard)
  createFromFile(@Body() dto: CatalogFileDto) {
    return this.catalogService.createFromFile(dto);
  }

  @Get(":catalogId")
  @ApiOkResponse({ type: CatalogResponseDto })
  findOne(@Param("catalogId") catalogId: string) {
    return this.catalogService.findOne(catalogId);
  }

  @Get(":catalogId/export")
  @ApiQuery({ name: "format", enum: ["csv", "json"] })
  async export(@Param("catalogId") catalogId: string, @Query("format") format: string, @Res() res: Response): Promise<void> {
    if (format !== "csv" && format !== "json") throw new BadRequestException("format must be csv or json");
    const file = await this.catalogService.export(catalogId, format);
    res
      .set({ "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${file.filename}"` })
      .send(file.body);
  }

  @Post()
  @UseGuards(GlobalAdminGuard)
  @ApiCreatedResponse({ type: CatalogResponseDto })
  create(@Body() dto: CreateCatalogDto) {
    return this.catalogService.create(dto);
  }

  @Patch(":catalogId")
  @UseGuards(GlobalAdminGuard)
  @ApiOkResponse({ type: CatalogResponseDto })
  update(@Param("catalogId") catalogId: string, @Body() dto: UpdateCatalogDto) {
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
  addEntry(@Param("catalogId") catalogId: string, @Body() dto: CatalogEntryInputDto) {
    return this.catalogService.addEntry(catalogId, dto);
  }

  /** Changes only the fields sent. */
  @Patch(":catalogId/entries/:entryId")
  @UseGuards(GlobalAdminGuard)
  @ApiOkResponse({ type: CatalogEntryResponseDto })
  updateEntry(@Param("catalogId") catalogId: string, @Param("entryId") entryId: string, @Body() dto: CatalogEntryInputDto) {
    return this.catalogService.updateEntry(catalogId, entryId, dto);
  }

  @Delete(":catalogId/entries/:entryId")
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeEntry(@Param("catalogId") catalogId: string, @Param("entryId") entryId: string): Promise<void> {
    return this.catalogService.removeEntry(catalogId, entryId);
  }

  /** CSV or JSON; `dryRun` previews. See the service for merge/replace. */
  @Post(":catalogId/entries/import")
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ImportCatalogResultDto })
  importEntries(@Param("catalogId") catalogId: string, @Body() dto: ImportCatalogEntriesDto) {
    return this.catalogService.importEntries(catalogId, dto);
  }
}
