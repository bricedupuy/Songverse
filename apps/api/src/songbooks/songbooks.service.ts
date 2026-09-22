import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { computeSectionLabel, validateSongbookSections, type SongbookSection } from "@songverse/core";
import { Prisma } from "@songverse/db";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { isOwnedByOrMemberOf } from "../common/utils/ownership-visibility";
import { SongVersionsService, type SongVersionOwner } from "../song-versions/song-versions.service";
import type { AddSongbookEntryDto } from "./dto/add-songbook-entry.dto";
import type { CreateSongbookDto } from "./dto/create-songbook.dto";
import type { ImportSongbookFromCatalogDto } from "./dto/import-songbook-from-catalog.dto";
import type { UpdateSongbookDto } from "./dto/update-songbook.dto";

const DETAIL_INCLUDE = {
  entries: {
    include: { songVersion: { select: { title: true } } },
    orderBy: { entryCode: "asc" as const },
  },
} satisfies Prisma.SongbookInclude;

type SongbookWithEntries = Prisma.SongbookGetPayload<{ include: typeof DETAIL_INCLUDE }>;

function toDetail(songbook: SongbookWithEntries) {
  const { entries, ...rest } = songbook;
  const sections = (songbook.sections as SongbookSection[] | null) ?? null;
  return {
    ...rest,
    sections,
    entries: entries.map((entry) => ({
      id: entry.id,
      songVersionId: entry.songVersionId,
      entryCode: entry.entryCode,
      songVersionTitle: entry.songVersion.title,
      sectionLabel: computeSectionLabel(entry.entryCode, sections),
    })),
  };
}

@Injectable()
export class SongbooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly songVersionsService: SongVersionsService,
  ) {}

  async findVisibleToUser(user: AuthenticatedUser): Promise<Prisma.SongbookGetPayload<object>[]> {
    if (user.isGlobalAdmin) {
      return this.prisma.client.songbook.findMany({ orderBy: { name: "asc" } });
    }

    const teamIds = (
      await this.prisma.client.teamMembership.findMany({
        where: { userId: user.id },
        select: { teamId: true },
      })
    ).map((m) => m.teamId);

    return this.prisma.client.songbook.findMany({
      where: {
        OR: [
          { ownerScope: "GLOBAL" },
          { ownerScope: "USER", ownerUserId: user.id },
          { ownerScope: "TEAM", ownerTeamId: { in: teamIds } },
        ],
      },
      orderBy: { name: "asc" },
    });
  }

  async findOne(user: AuthenticatedUser, songbookId: string) {
    const songbook = await this.prisma.client.songbook.findUnique({
      where: { id: songbookId },
      include: DETAIL_INCLUDE,
    });
    if (!songbook) throw new NotFoundException("Songbook not found");
    await this.assertVisible(user, songbook);

    // A songbook imported from a catalog (see docs/songbooks-and-catalog.md
    // §6) doesn't eagerly materialize every entry - a "pending" entry is a
    // catalog entry with no matching SongbookEntry yet, offered here so the
    // UI can let the owner "start" it on demand.
    let pendingEntries: { catalogEntryId: string; entryCode: string; title: string }[] = [];
    if (songbook.sourceCatalogId) {
      const materializedCodes = new Set(
        songbook.entries.map((entry) => entry.entryCode).filter((code): code is string => code !== null),
      );
      const catalogEntries = await this.prisma.client.songbookCatalogEntry.findMany({
        where: { catalogId: songbook.sourceCatalogId },
        orderBy: { entryCode: "asc" },
      });
      pendingEntries = catalogEntries
        .filter((entry) => !materializedCodes.has(entry.entryCode))
        .map((entry) => ({ catalogEntryId: entry.id, entryCode: entry.entryCode, title: entry.title }));
    }

    return { ...toDetail(songbook), pendingEntries };
  }

  private async assertVisible(
    user: AuthenticatedUser,
    songbook: { ownerScope: string; ownerUserId: string | null; ownerTeamId: string | null },
  ): Promise<void> {
    if (songbook.ownerScope === "GLOBAL") return;
    if (!(await isOwnedByOrMemberOf(this.prisma, user, songbook))) {
      throw new ForbiddenException("Not visible to you");
    }
  }

  async create(user: AuthenticatedUser, dto: CreateSongbookDto): Promise<Prisma.SongbookGetPayload<object>> {
    const owner = await this.resolveOwnership(user, { teamId: dto.teamId, global: dto.global });
    return this.prisma.client.songbook.create({
      data: {
        name: dto.name,
        kind: dto.kind,
        abbreviation: dto.abbreviation,
        language: dto.language,
        publisher: dto.publisher,
        year: dto.year,
        ...owner,
      },
    });
  }

  /**
   * Same USER/TEAM/GLOBAL choice used by create() and by importFromCatalog()
   * - a songbook imported from a catalog is still owned like any other
   * songbook, it just starts out with pending entries instead of none.
   */
  private async resolveOwnership(
    user: AuthenticatedUser,
    opts: { teamId?: string; global?: boolean },
  ): Promise<SongVersionOwner> {
    if (opts.global) {
      if (!user.isGlobalAdmin) throw new ForbiddenException("Only global admins can create a global songbook");
      return { ownerScope: "GLOBAL", ownerUserId: null, ownerTeamId: null };
    }
    if (opts.teamId) {
      const membership = await this.prisma.client.teamMembership.findUnique({
        where: { teamId_userId: { teamId: opts.teamId, userId: user.id } },
      });
      if (!membership) throw new ForbiddenException("Not a member of this team");
      return { ownerScope: "TEAM", ownerUserId: null, ownerTeamId: opts.teamId };
    }
    return { ownerScope: "USER", ownerUserId: user.id, ownerTeamId: null };
  }

  /**
   * Creates a new songbook linked to a catalog (docs/songbooks-and-catalog.md
   * §6). Always NUMBERED, since a catalog's entries carry a real entryCode
   * matching the printed edition. No entries are created here - they're
   * materialized lazily via materializeEntry() as the owner works through
   * findOne()'s pendingEntries list.
   */
  async importFromCatalog(
    user: AuthenticatedUser,
    dto: ImportSongbookFromCatalogDto,
  ): Promise<Prisma.SongbookGetPayload<object>> {
    const catalog = await this.prisma.client.songbookCatalog.findUnique({ where: { id: dto.catalogId } });
    if (!catalog) throw new NotFoundException("Songbook catalog not found");
    const owner = await this.resolveOwnership(user, { teamId: dto.teamId, global: dto.global });

    return this.prisma.client.songbook.create({
      data: {
        name: catalog.name,
        kind: "NUMBERED",
        abbreviation: catalog.abbreviation,
        language: catalog.language,
        publisher: catalog.publisher,
        sourceCatalogId: catalog.id,
        ...owner,
      },
    });
  }

  /**
   * Turns one pending catalog entry into a real, editable song: mints a
   * blank SongVersion under the songbook's own ownership and links it in
   * with the catalog entry's number. The user still has to add lyrics/
   * chords themselves - the catalog never carries copyrighted content.
   */
  async materializeEntry(songbookId: string, catalogEntryId: string) {
    const songbook = await this.prisma.client.songbook.findUnique({ where: { id: songbookId } });
    if (!songbook) throw new NotFoundException("Songbook not found");
    if (!songbook.sourceCatalogId) {
      throw new BadRequestException("This songbook was not imported from a catalog");
    }

    const catalogEntry = await this.prisma.client.songbookCatalogEntry.findUnique({
      where: { id: catalogEntryId },
    });
    if (!catalogEntry || catalogEntry.catalogId !== songbook.sourceCatalogId) {
      throw new NotFoundException("Catalog entry not found in this songbook's catalog");
    }

    const existing = await this.prisma.client.songbookEntry.findUnique({
      where: { songbookId_entryCode: { songbookId, entryCode: catalogEntry.entryCode } },
    });
    if (existing) throw new ConflictException("This catalog entry has already been imported");

    const version = await this.songVersionsService.createOwned(
      { ownerScope: songbook.ownerScope, ownerUserId: songbook.ownerUserId, ownerTeamId: songbook.ownerTeamId },
      { title: catalogEntry.title, language: songbook.language ?? catalogEntry.originalLanguage ?? "en" },
    );

    const entry = await this.prisma.client.songbookEntry.create({
      data: { songbookId, songVersionId: version.id, entryCode: catalogEntry.entryCode },
    });

    return {
      id: entry.id,
      songVersionId: entry.songVersionId,
      entryCode: entry.entryCode,
      songVersionTitle: version.title,
      sectionLabel: computeSectionLabel(entry.entryCode, songbook.sections as SongbookSection[] | null),
    };
  }

  update(songbookId: string, dto: UpdateSongbookDto): Promise<Prisma.SongbookGetPayload<object>> {
    let sections: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
    if (dto.sections !== undefined) {
      try {
        sections = validateSongbookSections(dto.sections) as unknown as Prisma.InputJsonValue;
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : String(error));
      }
    }

    return this.prisma.client.songbook.update({
      where: { id: songbookId },
      data: { ...dto, sections },
    });
  }

  async remove(songbookId: string): Promise<void> {
    await this.prisma.client.songbook.delete({ where: { id: songbookId } });
  }

  async addEntry(songbookId: string, dto: AddSongbookEntryDto) {
    const songbook = await this.prisma.client.songbook.findUnique({
      where: { id: songbookId },
      select: { kind: true, sections: true },
    });
    if (!songbook) throw new NotFoundException("Songbook not found");
    if (songbook.kind === "NUMBERED" && !dto.entryCode) {
      throw new BadRequestException("entryCode is required for a NUMBERED songbook");
    }
    const entryCode = songbook.kind === "NUMBERED" ? dto.entryCode! : null;

    const songVersion = await this.prisma.client.songVersion.findUnique({
      where: { id: dto.songVersionId },
      select: { id: true, title: true },
    });
    if (!songVersion) throw new NotFoundException("Song version not found");

    const entry = await this.prisma.client.songbookEntry
      .create({
        data: { songbookId, songVersionId: dto.songVersionId, entryCode },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictException("This song is already in this songbook, or its number is already taken");
        }
        throw error;
      });
    return {
      id: entry.id,
      songVersionId: entry.songVersionId,
      entryCode: entry.entryCode,
      songVersionTitle: songVersion.title,
      sectionLabel: computeSectionLabel(entry.entryCode, songbook.sections as SongbookSection[] | null),
    };
  }

  async removeEntry(songbookId: string, entryId: string): Promise<void> {
    const entry = await this.prisma.client.songbookEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.songbookId !== songbookId) throw new NotFoundException("Entry not found");
    await this.prisma.client.songbookEntry.delete({ where: { id: entryId } });
  }
}
