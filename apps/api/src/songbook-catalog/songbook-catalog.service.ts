import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@songverse/db";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCatalogEntryDto } from "./dto/create-catalog-entry.dto";
import type { CreateCatalogDto } from "./dto/create-catalog.dto";
import type { UpdateCatalogEntryDto } from "./dto/update-catalog-entry.dto";
import type { UpdateCatalogDto } from "./dto/update-catalog.dto";
import { parseCsvRecords } from "./parse-csv";

const DETAIL_INCLUDE = {
  entries: { orderBy: { entryCode: "asc" as const } },
} satisfies Prisma.SongbookCatalogInclude;

export interface ImportCsvResult {
  created: number;
  updated: number;
  errors: string[];
}

@Injectable()
export class SongbookCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Prisma.SongbookCatalogGetPayload<object>[]> {
    return this.prisma.client.songbookCatalog.findMany({ orderBy: { name: "asc" } });
  }

  async findOne(catalogId: string): Promise<Prisma.SongbookCatalogGetPayload<{ include: typeof DETAIL_INCLUDE }>> {
    const catalog = await this.prisma.client.songbookCatalog.findUnique({
      where: { id: catalogId },
      include: DETAIL_INCLUDE,
    });
    if (!catalog) throw new NotFoundException("Songbook catalog not found");
    return catalog;
  }

  create(dto: CreateCatalogDto): Promise<Prisma.SongbookCatalogGetPayload<object>> {
    return this.prisma.client.songbookCatalog.create({ data: dto });
  }

  async update(catalogId: string, dto: UpdateCatalogDto): Promise<Prisma.SongbookCatalogGetPayload<object>> {
    await this.ensureExists(catalogId);
    return this.prisma.client.songbookCatalog.update({ where: { id: catalogId }, data: dto });
  }

  async remove(catalogId: string): Promise<void> {
    await this.ensureExists(catalogId);
    await this.prisma.client.songbookCatalog.delete({ where: { id: catalogId } });
  }

  async addEntry(
    catalogId: string,
    dto: CreateCatalogEntryDto,
  ): Promise<Prisma.SongbookCatalogEntryGetPayload<object>> {
    await this.ensureExists(catalogId);
    return this.prisma.client.songbookCatalogEntry.upsert({
      where: { catalogId_entryCode: { catalogId, entryCode: dto.entryCode } },
      update: dto,
      create: { ...dto, catalogId },
    });
  }

  async updateEntry(
    catalogId: string,
    entryId: string,
    dto: UpdateCatalogEntryDto,
  ): Promise<Prisma.SongbookCatalogEntryGetPayload<object>> {
    const entry = await this.prisma.client.songbookCatalogEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.catalogId !== catalogId) throw new NotFoundException("Catalog entry not found");
    return this.prisma.client.songbookCatalogEntry.update({ where: { id: entryId }, data: dto });
  }

  async removeEntry(catalogId: string, entryId: string): Promise<void> {
    const entry = await this.prisma.client.songbookCatalogEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.catalogId !== catalogId) throw new NotFoundException("Catalog entry not found");
    await this.prisma.client.songbookCatalogEntry.delete({ where: { id: entryId } });
  }

  /**
   * Upserts entries from a CSV (header row required; recognized columns:
   * entryCode, title, originalLanguage, composer, author, ccli). Rows
   * missing entryCode or title are skipped and reported, not thrown - a
   * single bad row in a 1000+ row file shouldn't abort the whole import.
   */
  async importCsv(catalogId: string, csv: string): Promise<ImportCsvResult> {
    await this.ensureExists(catalogId);
    const records = parseCsvRecords(csv);

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const [index, record] of records.entries()) {
      const rowNumber = index + 2; // +1 for the header row, +1 for 1-indexing
      const entryCode = record.entryCode?.trim();
      const title = record.title?.trim();
      if (!entryCode) {
        errors.push(`Row ${rowNumber}: missing entryCode`);
        continue;
      }
      if (!title) {
        errors.push(`Row ${rowNumber}: missing title`);
        continue;
      }

      const data = {
        title,
        originalLanguage: record.originalLanguage || null,
        composer: record.composer || null,
        author: record.author || null,
        ccli: record.ccli || null,
      };

      const existing = await this.prisma.client.songbookCatalogEntry.findUnique({
        where: { catalogId_entryCode: { catalogId, entryCode } },
      });
      await this.prisma.client.songbookCatalogEntry.upsert({
        where: { catalogId_entryCode: { catalogId, entryCode } },
        update: data,
        create: { ...data, catalogId, entryCode },
      });
      if (existing) updated++;
      else created++;
    }

    return { created, updated, errors };
  }

  private async ensureExists(catalogId: string): Promise<void> {
    const exists = await this.prisma.client.songbookCatalog.findUnique({
      where: { id: catalogId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Songbook catalog not found");
  }
}
