import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  computeSectionLabel,
  foldForSearch,
  formatSongbookReference,
  MusicBrainzRecordingMatchSchema,
  detectImportFormat,
  flowItemId,
  parseSongDocumentV2,
  parseStreamingLink,
  readSongDocument,
  safeParseSongDocumentV2,
  songDocumentFromSections,
  songDocumentFromText,
  songFromText,
  songToChordPro,
  splitNames,
  type CatalogEntryData,
  type MusicBrainzRecordingMatch,
  type SongbookSection,
  type SongDefaultsV2,
  type SongDocumentV2,
  type StreamingIdentifierType,
  type SupportedImportFormat,
} from "@songverse/core";
import type { ContributorRole, Prisma, VersionRelationshipType } from "@songverse/db";
import { MusicBrainzService } from "../musicbrainz/musicbrainz.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { AccessPolicyService } from "../access/access-policy.service";
import { setOrder } from "../common/utils/set-order";
import type { CreateSongVersionDto } from "./dto/create-song-version.dto";
import type { ListSongVersionsQueryDto } from "./dto/list-song-versions-query.dto";
import type { SongFieldsDto } from "./dto/song-fields.dto";
import type { UpdateSongVersionDto } from "./dto/update-song-version.dto";

/** A version's own fields: the columns (the document holds only the music). */
type VersionFields = {
  title: string;
  language: string;
  alternateTitle?: string | null;
  versionName?: string | null;
  sortTitle?: string | null;
  album?: string | null;
  year?: number | null;
  copyright?: string | null;
  copyrightYear?: number | null;
  publisher?: string | null;
  ccli?: string | null;
  isrc?: string | null;
  reference?: string | null;
  notes?: string | null;
};

type CreateExtras = {
  defaults?: SongDefaultsV2;
  sections?: SongDocumentV2["sections"];
  flow?: SongDocumentV2["flow"];
  capo?: number | null;
  credits?: { source: string; roles: ContributorRole[] }[];
  tagIds?: string[];
  /** Add to this existing Work. */
  workId?: string;
  /** Derived from this version (e.g. a translation of it): joins its Work. */
  parent?: { id: string; workId: string; relationshipType: VersionRelationshipType };
};

/** One credit per person (ignoring case), with all their roles. */
function mergeCredits(entries: readonly (readonly [string, ContributorRole])[]): { source: string; roles: ContributorRole[] }[] {
  const credits: { source: string; roles: ContributorRole[] }[] = [];
  for (const [name, role] of entries) {
    const existing = credits.find((credit) => credit.source.toLowerCase() === name.toLowerCase());
    if (!existing) credits.push({ source: name, roles: [role] });
    else if (!existing.roles.includes(role)) existing.roles.push(role);
  }
  return credits;
}

/**
 * Swaps the artist a MusicBrainz link added (isAutoAttached) for `artist`
 * - or removes it, for null. A previous link's row is replaced so
 * re-linking doesn't leave the old artist alongside the new one, and rows
 * added by hand (a composer, say) aren't touched. Two rules on top: no
 * second copy of an artist the song already credits, and a song never
 * ends up with no artist - the old one is then kept, as an ordinary one.
 */
async function replaceAutoAttachedArtist(tx: Prisma.TransactionClient, songVersionId: string, artist: string | null): Promise<void> {
  const performers = await tx.versionContributor.findMany({
    where: { songVersionId, roles: { has: "PERFORMER" } },
    select: { id: true, source: true, isAutoAttached: true },
  });
  const manual = performers.filter((p) => !p.isAutoAttached);
  const auto = performers.filter((p) => p.isAutoAttached);
  const same = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();

  if (artist && !manual.some((p) => same(p.source, artist))) {
    if (auto.length === 1 && same(auto[0]!.source, artist)) return;
    await tx.versionContributor.deleteMany({ where: { songVersionId, isAutoAttached: true } });
    await tx.versionContributor.create({ data: { songVersionId, userId: null, source: artist, roles: ["PERFORMER"], isAutoAttached: true } });
    return;
  }
  if (manual.length > 0 || auto.length === 0) {
    await tx.versionContributor.deleteMany({ where: { songVersionId, isAutoAttached: true } });
    return;
  }
  // The link's artist is the only one: keep it, now as the song's own.
  await tx.versionContributor.updateMany({ where: { songVersionId, isAutoAttached: true }, data: { isAutoAttached: false } });
}

/** The chart's defaults a DTO sets (undefined leaves one alone, null clears it). */
function defaultsFrom(dto: SongFieldsDto): SongDefaultsV2 {
  return {
    ...(dto.key !== undefined && { key: dto.key }),
    ...(dto.tempo !== undefined && { tempo: dto.tempo }),
    ...(dto.timeSignature !== undefined && { timeSignature: parseTimeSignature(dto.timeSignature) }),
    ...(dto.durationSeconds !== undefined && { durationSeconds: dto.durationSeconds }),
  };
}

/** The credits a DTO lists, by role; roles it leaves out aren't there. */
function creditListsFrom(dto: SongFieldsDto & { artists?: string[] }): Partial<Record<ContributorRole, string[]>> {
  return {
    ...(dto.artists && { PERFORMER: dto.artists }),
    ...(dto.composers && { COMPOSER: dto.composers }),
    ...(dto.lyricists && { LYRICIST: dto.lyricists }),
    ...(dto.writers && { AUTHOR: dto.writers }),
    ...(dto.arrangers && { ARRANGER: dto.arrangers }),
    ...(dto.translators && { TRANSLATOR: dto.translators }),
    ...(dto.adaptors && { ADAPTOR: dto.adaptors }),
  };
}

/**
 * Makes `lists[role]` exactly who the song credits in each listed role,
 * leaving other roles alone: a person keeps one row with all their roles
 * (a composer who's also the lyricist), rows left with no role go, and
 * artists come first, in the order given.
 */
async function replaceCredits(
  tx: Prisma.TransactionClient,
  songVersionId: string,
  lists: Partial<Record<ContributorRole, string[]>>,
): Promise<void> {
  const roles = Object.keys(lists) as ContributorRole[];
  if (roles.length === 0) return;
  const wanted = new Map<string, { name: string; roles: ContributorRole[] }>();
  for (const role of roles) {
    for (const name of lists[role] ?? []) {
      const entry = wanted.get(name.toLowerCase()) ?? { name, roles: [] };
      if (!entry.roles.includes(role)) entry.roles.push(role);
      wanted.set(name.toLowerCase(), entry);
    }
  }

  const rows = await tx.versionContributor.findMany({
    where: { songVersionId },
    select: { id: true, source: true, roles: true },
    orderBy: { displayOrder: "asc" },
  });
  // `id` is null for the people added now.
  const kept: { id: string | null; source: string | null; roles: ContributorRole[] }[] = [];
  const removed: string[] = [];
  for (const row of rows) {
    const nextRoles = row.roles.filter((role) => !roles.includes(role));
    const match = row.source ? wanted.get(row.source.toLowerCase()) : undefined;
    if (match) {
      nextRoles.push(...match.roles.filter((role) => !nextRoles.includes(role)));
      wanted.delete(row.source!.toLowerCase());
    }
    if (nextRoles.length === 0) {
      removed.push(row.id);
      continue;
    }
    if (nextRoles.length !== row.roles.length || nextRoles.some((role) => !row.roles.includes(role))) {
      await tx.versionContributor.update({ where: { id: row.id }, data: { roles: nextRoles } });
    }
    kept.push({ id: row.id, source: row.source, roles: nextRoles });
  }
  for (const entry of wanted.values()) kept.push({ id: null, source: entry.name, roles: entry.roles });

  const artistOrder = (lists.PERFORMER ?? []).map((name) => name.toLowerCase());
  const rank = (row: (typeof kept)[number]) => {
    const index = row.source ? artistOrder.indexOf(row.source.toLowerCase()) : -1;
    return row.roles.includes("PERFORMER") ? (index === -1 ? artistOrder.length : index) : artistOrder.length + 1;
  };
  const ordered = kept
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }, order) => ({ ...row, order }));

  if (removed.length > 0) await tx.versionContributor.deleteMany({ where: { id: { in: removed } } });
  await tx.versionContributor.createMany({
    data: ordered
      .filter((row) => row.id === null)
      .map((row) => ({ songVersionId, userId: null, source: row.source, roles: row.roles, displayOrder: row.order })),
  });
  await setOrder(
    tx,
    "VersionContributor",
    ordered.flatMap(({ id, order }) => (id ? [{ id, order }] : [])),
  );
}

function staleRevision(): ConflictException {
  return new ConflictException("This song was changed somewhere else since you opened it. Reload it to see the changes.");
}

/**
 * The chart as the structured editor sends it - its sections and/or the
 * order they're sung in, IDs as they are - checked as a whole document
 * would be (IDs unique, chords on characters and in order, the flow only
 * naming sections that exist); a 400 naming the first problem otherwise.
 * `current` stands in for sections not sent.
 */
function chartFrom(
  dto: SongFieldsDto,
  current: SongDocumentV2["sections"],
): { sections: SongDocumentV2["sections"]; flow: SongDocumentV2["flow"] | undefined } | undefined {
  if (dto.sections === undefined && dto.flow === undefined) return undefined;
  if (dto.content !== undefined) throw new BadRequestException("Send the chart as content or as sections, not both");
  const sections = dto.sections ?? current;
  const parsed = safeParseSongDocumentV2({
    $schema: "song-document/v2",
    revision: 0,
    defaults: {},
    sections,
    flow: dto.flow ?? (sections as { id?: unknown }[]).map((section) => ({ id: `fi_${String(section?.id)}`, sectionId: section?.id })),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new BadRequestException(`${issue.path.join(".")}: ${issue.message}`);
  }
  return { sections: parsed.data.sections, flow: dto.flow === undefined ? undefined : parsed.data.flow };
}

function parseTimeSignature(text: string | null): { numerator: number; denominator: number } | null {
  const match = text ? /^(\d+)\/(\d+)$/.exec(text) : null;
  return match ? { numerator: Number(match[1]), denominator: Number(match[2]) } : null;
}

function foldName(name: string): string {
  return foldForSearch(name).trim().replace(/\s+/g, " ");
}

const LIST_SELECT = {
  id: true,
  workId: true,
  title: true,
  alternateTitle: true,
  versionName: true,
  language: true,
  ownerScope: true,
  ownerUserId: true,
  ownerTeamId: true,
  publicationState: true,
  ccli: true,
  createdAt: true,
  updatedAt: true,
  // Just the artist(s) — enough for the library list to show "Title —
  // Artist" without pulling in the full contributor list (composer,
  // lyricist, etc.), which only the detail page needs.
  contributors: {
    where: { roles: { has: "PERFORMER" as ContributorRole } },
    select: { id: true, userId: true, source: true },
    orderBy: { displayOrder: "asc" },
  },
  versionTags: {
    select: {
      id: true,
      tag: { select: { id: true, categoryId: true, slug: true, label: true, translations: true } },
    },
  },
} satisfies Prisma.SongVersionSelect;

const STREAMING_IDENTIFIER_TYPES = ["SPOTIFY", "APPLE_MUSIC", "YOUTUBE"] as const;

export interface SongVersionOwner {
  ownerScope: "GLOBAL" | "TEAM" | "USER";
  ownerUserId: string | null;
  ownerTeamId: string | null;
}

const DETAIL_SELECT = {
  ...LIST_SELECT,
  sortTitle: true,
  album: true,
  year: true,
  copyright: true,
  copyrightYear: true,
  publisher: true,
  isrc: true,
  reference: true,
  notes: true,
  relationshipType: true,
  // The version this one derives from (e.g. the original of a translation).
  parentVersion: { select: { id: true, title: true, language: true } },
  documentJson: true,
  capo: true,
  contributors: {
    select: { id: true, userId: true, source: true, roles: true, isAutoAttached: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  },
  // CCLI has its own column and MusicBrainz its own endpoint (live lookup) -
  // this is just the plain "links" (Spotify/Apple Music/YouTube/custom),
  // which have nothing more to fetch than what's stored.
  identifiers: {
    where: { type: { in: [...STREAMING_IDENTIFIER_TYPES, "CUSTOM"] } },
    select: { id: true, type: true, value: true, sourceUrl: true },
  },
} satisfies Prisma.SongVersionSelect;

type ListRow = Prisma.SongVersionGetPayload<{ select: typeof LIST_SELECT }>;
/** One page of a song list, with the total across all pages. */
export interface SongPage {
  items: ListItem[];
  total: number;
  page: number;
  pageSize: number;
}
type ListItem = Omit<ListRow, "contributors" | "versionTags"> & {
  artists: ListRow["contributors"];
  tags: ListRow["versionTags"][number]["tag"][];
};

// The Prisma relations are named `contributors`/`versionTags` no matter
// how they're filtered; renamed here (`artists`, `tags`) so the
// (performer-only) list/create payload and the (all-roles) detail payload
// don't share a field name that means two different things, and so the
// join row (versionTags' own `id`, not useful to the client) doesn't leak
// into what's otherwise just a list of tags.
function toListItem({ contributors, versionTags, ...rest }: ListRow): ListItem {
  return { ...rest, artists: contributors, tags: versionTags.map((vt) => vt.tag) };
}

type DetailRow = Prisma.SongVersionGetPayload<{ select: typeof DETAIL_SELECT }>;
type DetailItem = Omit<DetailRow, "versionTags" | "documentJson"> & {
  /** Always v2: a song saved before v2 is upgraded as it's read. */
  documentJson: SongDocumentV2;
  artists: DetailRow["contributors"];
  tags: DetailRow["versionTags"][number]["tag"][];
  /** Whether the current user may change it (see SongVersionOwnerGuard). */
  canEdit: boolean;
};

function toDetailItem(version: DetailRow, canEdit: boolean): DetailItem {
  const { versionTags, documentJson, ...rest } = version;
  return {
    ...rest,
    documentJson: readSongDocument(documentJson),
    artists: version.contributors.filter((c) => c.roles.includes("PERFORMER")),
    tags: versionTags.map((vt) => vt.tag),
    canEdit,
  };
}

/** A name someone's already credited under, for autocomplete. */
export interface CreditSuggestion {
  name: string;
  roles: ContributorRole[];
  songCount: number;
}

const MATCH_VERSION_SELECT = {
  id: true,
  workId: true,
  title: true,
  versionName: true,
  language: true,
  ownerScope: true,
  ownerTeam: { select: { name: true } },
  documentJson: true,
  contributors: {
    where: { roles: { has: "PERFORMER" as ContributorRole } },
    select: { source: true },
    orderBy: { displayOrder: "asc" },
  },
} satisfies Prisma.SongVersionSelect;

@Injectable()
export class SongVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly musicBrainz: MusicBrainzService,
    private readonly access: AccessPolicyService,
  ) {}

  /**
   * One page of the songs the user can see, searched and filtered, with
   * the total across all pages. `q` matches the title, subtitle, version
   * name or an artist (anywhere in them, ignoring case - through the
   * trigram-indexed searchText column), or a CCLI number exactly.
   */
  async findVisibleToUser(user: AuthenticatedUser, query: ListSongVersionsQueryDto = {}): Promise<SongPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const q = query.q?.trim();
    const where: Prisma.SongVersionWhereInput = {
      AND: [
        await this.access.songsVisibleTo(user),
        ...(q
          ? [
              {
                // searchText is the title, subtitle, version name and performers (kept by the database; see the schema).
                OR: [{ searchText: { contains: await this.unaccent(q), mode: "insensitive" as const } }, { ccli: q }],
              },
            ]
          : []),
        ...(query.language ? [{ language: query.language }] : []),
        ...(query.tagId ? [{ versionTags: { some: { tagId: query.tagId } } }] : []),
      ],
    };
    const sort = query.sort ?? "updatedAt";
    const dir = query.dir ?? (sort === "updatedAt" || sort === "createdAt" ? "desc" : "asc");
    const [total, versions] = await Promise.all([
      this.prisma.client.songVersion.count({ where }),
      this.prisma.client.songVersion.findMany({
        where,
        select: LIST_SELECT,
        // Ties (same title, say) keep a stable order across pages.
        orderBy: [{ [sort]: dir }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: versions.map(toListItem), total, page, pageSize };
  }

  /** How many songs, and distinct artists, the user can see - for the dashboard. */
  async statsForUser(user: AuthenticatedUser): Promise<{ songCount: number; artistCount: number }> {
    const where = await this.access.songsVisibleTo(user);
    const [songCount, artists] = await Promise.all([
      this.prisma.client.songVersion.count({ where }),
      this.prisma.client.versionContributor.findMany({
        where: { roles: { has: "PERFORMER" }, source: { not: null }, songVersion: where },
        select: { source: true },
        distinct: ["source"],
      }),
    ]);
    return { songCount, artistCount: new Set(artists.map((a) => a.source!.trim().toLowerCase())).size };
  }

  /**
   * `text` without accents, by the database's own unaccent() - the one that
   * keeps searchText and sourceSearch - so a query and what it's matched
   * against are folded the same way ("cœur" and "coeur" too) (issue #56).
   */
  private async unaccent(text: string): Promise<string> {
    const [row] = await this.prisma.client.$queryRaw<{ folded: string }[]>`SELECT unaccent(${text}) AS folded`;
    return row?.folded ?? text;
  }

  async findOne(user: AuthenticatedUser, id: string): Promise<DetailItem> {
    const version = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!version) throw new NotFoundException("Song version not found");
    if (!(await this.access.canSeeSong(user, version))) throw new ForbiddenException("Not visible to you");
    return toDetailItem(version, await this.access.canEdit(user, version));
  }

  /**
   * Names credited on songs the user can see that contain `query` (all of
   * them, for an empty one), with every role they're credited in - for
   * autocompleting artists, composers and lyricists. Names that start with
   * the query come first, then the most credited.
   */
  async searchCredits(user: AuthenticatedUser, query: string): Promise<CreditSuggestion[]> {
    const q = query.trim();
    const songVersion = await this.access.songsVisibleTo(user);
    // Counted in the database, per name and roles: the most credited names
    // containing the query, and separately those starting with it (so a
    // rarer name that starts with it isn't pushed out by commoner ones).
    const credited = (sourceSearch: Prisma.StringNullableFilter<"VersionContributor">) =>
      this.prisma.client.versionContributor.groupBy({
        by: ["source", "roles"],
        // Ignoring accents too (issue #56): sourceSearch is the name without them.
        where: { source: { not: null }, sourceSearch, songVersion },
        _count: { _all: true },
        orderBy: { _count: { source: "desc" } },
        take: 50,
      });
    const folded = q ? await this.unaccent(q) : "";
    const groups = (
      await Promise.all([
        folded ? credited({ startsWith: folded, mode: "insensitive" }) : [],
        credited(folded ? { contains: folded, mode: "insensitive" } : { not: null }),
      ])
    ).flat();
    const byName = new Map<string, CreditSuggestion>();
    const counted = new Set<string>();
    for (const group of groups) {
      const name = group.source!.trim();
      const key = `${group.source}\u0000${group.roles.join()}`;
      if (counted.has(key)) continue;
      counted.add(key);
      const entry = byName.get(name.toLowerCase()) ?? { name, roles: [], songCount: 0 };
      entry.songCount += group._count._all;
      for (const role of group.roles) if (!entry.roles.includes(role)) entry.roles.push(role);
      byName.set(name.toLowerCase(), entry);
    }
    const lower = q.toLowerCase();
    const startsWith = (s: CreditSuggestion) => (lower && s.name.toLowerCase().startsWith(lower) ? 0 : 1);
    return [...byName.values()]
      .sort((a, b) => startsWith(a) - startsWith(b) || b.songCount - a.songCount || a.name.localeCompare(b.name))
      .slice(0, 10);
  }

  /**
   * Songs the user can see with this title (or subtitle), ignoring case -
   * or titled it plus a parenthesised addition, "Amazing Grace (My Chains
   * Are Gone)" - each with every version of it they can see, so adding a
   * song can offer to open one or add another version instead.
   */
  async findMatches(user: AuthenticatedUser, title: string) {
    const t = title.trim();
    if (!t) return [];
    const visible = await this.access.songsVisibleTo(user);
    const matching = await this.prisma.client.songVersion.findMany({
      where: {
        AND: [
          visible,
          {
            OR: [
              { title: { equals: t, mode: "insensitive" } },
              { title: { startsWith: `${t} (`, mode: "insensitive" } },
              { alternateTitle: { equals: t, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: { id: true, workId: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    const workIds = [...new Set(matching.map((v) => v.workId))].slice(0, 5);
    if (workIds.length === 0) return [];
    const versions = await this.prisma.client.songVersion.findMany({
      where: { AND: [visible, { workId: { in: workIds } }] },
      select: MATCH_VERSION_SELECT,
      orderBy: { createdAt: "asc" },
    });
    const matchedIds = new Set(matching.map((v) => v.id));
    return workIds.map((workId) => ({
      workId,
      versions: versions
        .filter((v) => v.workId === workId)
        .sort((a, b) => Number(matchedIds.has(b.id)) - Number(matchedIds.has(a.id)))
        .map(({ documentJson, contributors, ownerTeam, ...rest }) => {
          const key = (documentJson as { defaults?: { key?: unknown } } | null)?.defaults?.key;
          return {
            ...rest,
            teamName: ownerTeam?.name ?? null,
            key: typeof key === "string" && key ? key : null,
            artists: contributors.map((c) => c.source).filter((name): name is string => !!name),
            matchesTitle: matchedIds.has(rest.id),
          };
        }),
    }));
  }

  /** Throws unless every id is a tag the user can use. */
  private async assertTagsUsable(user: AuthenticatedUser, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    const unique = [...new Set(tagIds)];
    const found = await this.prisma.client.tag.count({ where: { AND: [{ id: { in: unique } }, await this.access.tagsVisibleTo(user)] } });
    if (found !== unique.length) throw new BadRequestException("Unknown tag");
  }

  /**
   * Lists the songbooks this song version is a member of, filtered to
   * what `user` can see - a private songbook's membership (e.g. someone
   * else's personal set list) must never leak through a song that's
   * otherwise publicly visible. See docs/songbooks-and-catalog.md §5.
   */
  async findSongbookMemberships(user: AuthenticatedUser, songVersionId: string) {
    const entries = await this.prisma.client.songbookEntry.findMany({
      where: { songVersionId, songbook: await this.access.songbooksVisibleTo(user) },
      include: { songbook: true },
    });

    return entries
      .map((entry) => {
        const membership = {
          songbookId: entry.songbookId,
          songbookName: entry.songbook.name,
          abbreviation: entry.songbook.abbreviation,
          entryCode: entry.entryCode,
          sectionLabel: computeSectionLabel(entry.entryCode, entry.songbook.sections as SongbookSection[] | null),
        };
        // "JEM 855 · JEM3": to give someone without the app (issue #55).
        return { ...membership, reference: formatSongbookReference(membership) };
      })
      .sort((a, b) => a.songbookName.localeCompare(b.songbookName));
  }

  /**
   * Creates a new Song Version, with its artist(s). Without a `workId`,
   * this also creates a new Work with this version set as its preferred
   * original — a Work has no title of its own (it's just the grouping of
   * versions of "the same song"), so a version is the smallest thing a
   * user can meaningfully create on its own.
   */
  async create(user: AuthenticatedUser, dto: CreateSongVersionDto): Promise<ListItem> {
    let ownerTeamId: string | null = null;
    if (dto.teamId) {
      if (!(await this.access.teamRole(user.id, dto.teamId))) throw new ForbiddenException("Not a member of this team");
      ownerTeamId = dto.teamId;
    }
    const ownerScope = ownerTeamId ? "TEAM" : "USER";
    const owner: SongVersionOwner = { ownerScope, ownerUserId: ownerTeamId ? null : user.id, ownerTeamId };

    let parent: CreateExtras["parent"];
    if (dto.basedOnVersionId) {
      const base = await this.prisma.client.songVersion.findUnique({
        where: { id: dto.basedOnVersionId },
        select: { id: true, workId: true, ownerScope: true, ownerUserId: true, ownerTeamId: true, publicationState: true },
      });
      if (!base) throw new NotFoundException("Song version not found");
      if (!(await this.access.canSeeSong(user, base))) throw new ForbiddenException("Not visible to you");
      parent = { id: base.id, workId: base.workId, relationshipType: "ALTERNATE_VERSION" };
    } else if (dto.workId) {
      const work = await this.prisma.client.work.findUnique({ where: { id: dto.workId }, select: { id: true } });
      if (!work) throw new NotFoundException("Work not found");
    }
    if (dto.tagIds) await this.assertTagsUsable(user, dto.tagIds);

    const content = dto.content?.trim() ? dto.content : null;
    const chart = chartFrom(dto, []) ?? (content ? songFromText(content, dto.contentFormat ?? detectImportFormat(content)) : undefined);
    return this.createVersion(
      owner,
      {
        title: dto.title,
        language: dto.language,
        alternateTitle: dto.alternateTitle,
        versionName: dto.versionName,
        sortTitle: dto.sortTitle,
        album: dto.album,
        year: dto.year,
        copyright: dto.copyright,
        copyrightYear: dto.copyrightYear,
        publisher: dto.publisher,
        ccli: dto.ccli,
        isrc: dto.isrc,
        reference: dto.reference,
        notes: dto.notes,
      },
      {
        workId: dto.workId,
        parent,
        defaults: defaultsFrom(dto),
        sections: chart?.sections ?? [],
        flow: chart?.flow,
        capo: dto.capo || null,
        credits: mergeCredits(
          Object.entries(creditListsFrom(dto)).flatMap(([role, names]) => names.map((name) => [name, role as ContributorRole] as const)),
        ),
        tagIds: dto.tagIds ? [...new Set(dto.tagIds)] : [],
      },
    );
  }

  /**
   * A new song from a songbook catalogue entry, under any ownership
   * (including GLOBAL, which the public create() endpoint never lets a
   * caller pick). Used by SongbooksService when materializing a pending
   * catalog entry - see docs/songbooks-and-catalog.md §6 and
   * docs/songbook-catalog-format.md. Every field of the entry is carried
   * over: song fields, key/tempo/time signature/duration on the chart,
   * artists, composers and lyricists as credits (several per field,
   * separated by ";"), tags matching existing ones (the rest are dropped),
   * and - given the song its "Original song" entry became - a place in that
   * song's Work as its translation.
   */
  async createFromCatalogEntry(
    owner: SongVersionOwner,
    entry: CatalogEntryData,
    language: string,
    original: { id: string; workId: string } | null = null,
  ): Promise<ListItem> {
    const timeSignature = parseTimeSignature(entry.timeSignature);
    return this.createVersion(
      owner,
      {
        title: entry.title,
        language,
        alternateTitle: entry.subtitle,
        sortTitle: entry.sortTitle,
        album: entry.album,
        year: entry.year,
        copyright: entry.copyright,
        ccli: entry.ccli,
        isrc: entry.isrc,
        reference: entry.reference,
        notes: entry.notes,
      },
      {
        defaults: {
          ...(entry.key && { key: entry.key }),
          ...(entry.tempo && { tempo: entry.tempo }),
          ...(timeSignature && { timeSignature }),
          ...(entry.durationSeconds && { durationSeconds: entry.durationSeconds }),
        },
        credits: mergeCredits([
          ...splitNames(entry.artist).map((name) => [name, "PERFORMER"] as const),
          ...splitNames(entry.composer).map((name) => [name, "COMPOSER"] as const),
          ...splitNames(entry.lyricist).map((name) => [name, "LYRICIST"] as const),
        ]),
        tagIds: await this.matchTagIds(owner, entry.tags),
        parent: original ? { ...original, relationshipType: "DIRECT_TRANSLATION" } : undefined,
      },
    );
  }

  /**
   * Ids of the existing tags the owner can use whose name - English label,
   * slug, or any translation - matches one of `names`, ignoring case and
   * accents. Names with no such tag are dropped.
   */
  private async matchTagIds(owner: SongVersionOwner, names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const tags = await this.prisma.client.tag.findMany({
      where: {
        OR: [
          { scope: "GLOBAL", isApproved: true },
          ...(owner.ownerUserId ? [{ scope: "USER" as const, ownerUserId: owner.ownerUserId }] : []),
          ...(owner.ownerTeamId ? [{ scope: "TEAM" as const, ownerTeamId: owner.ownerTeamId }] : []),
        ],
      },
      select: { id: true, label: true, slug: true, translations: true },
    });
    const byName = new Map<string, string>();
    for (const tag of tags) {
      const translations = tag.translations && typeof tag.translations === "object" ? Object.values(tag.translations) : [];
      for (const name of [tag.label, tag.slug.replace(/-/g, " "), ...translations]) {
        if (typeof name === "string" && !byName.has(foldName(name))) byName.set(foldName(name), tag.id);
      }
    }
    return [...new Set(names.map((name) => byName.get(foldName(name))).filter((id): id is string => !!id))];
  }

  private buildVersionData(
    owner: SongVersionOwner,
    fields: VersionFields,
    defaults: SongDefaultsV2 = {},
    sections: SongDocumentV2["sections"] = [],
    capo: number | null = null,
    flow?: SongDocumentV2["flow"],
  ) {
    const documentJson: SongDocumentV2 = parseSongDocumentV2({
      $schema: "song-document/v2",
      revision: 1,
      defaults,
      sections,
      flow: flow ?? sections.map((section) => ({ id: flowItemId(section.id), sectionId: section.id })),
    });

    return {
      ...owner,
      title: fields.title,
      alternateTitle: fields.alternateTitle ?? null,
      versionName: fields.versionName ?? null,
      sortTitle: fields.sortTitle ?? null,
      language: fields.language,
      album: fields.album ?? null,
      year: fields.year ?? null,
      copyright: fields.copyright ?? null,
      copyrightYear: fields.copyrightYear ?? null,
      publisher: fields.publisher ?? null,
      ccli: fields.ccli ?? null,
      isrc: fields.isrc ?? null,
      reference: fields.reference ?? null,
      notes: fields.notes ?? null,
      capo,
      documentJson: documentJson as object,
    };
  }

  /**
   * One transaction: the version, in a new Work (or `workId`'s, or as
   * `parent`'s derived version in its Work), with its credits and tags.
   */
  private async createVersion(owner: SongVersionOwner, fields: VersionFields, extras: CreateExtras = {}): Promise<ListItem> {
    const versionData = this.buildVersionData(owner, fields, extras.defaults, extras.sections, extras.capo ?? null, extras.flow);
    const version = await this.prisma.client.$transaction(async (tx) => {
      const existingWorkId = extras.parent?.workId ?? extras.workId;
      const workId = existingWorkId ?? (await tx.work.create({ data: {} })).id;
      const created = await tx.songVersion.create({
        data: {
          ...versionData,
          workId,
          ...(extras.parent && { parentVersionId: extras.parent.id, relationshipType: extras.parent.relationshipType }),
        },
        select: { id: true },
      });
      if (extras.credits?.length) {
        await tx.versionContributor.createMany({
          data: extras.credits.map((credit, displayOrder) => ({ songVersionId: created.id, source: credit.source, roles: credit.roles, displayOrder })),
        });
      }
      if (extras.tagIds?.length) {
        await tx.songVersionTag.createMany({ data: extras.tagIds.map((tagId) => ({ songVersionId: created.id, tagId })) });
      }
      if (!existingWorkId) {
        await tx.work.update({ where: { id: workId }, data: { preferredOriginalVersionId: created.id } });
      }
      return tx.songVersion.findUniqueOrThrow({ where: { id: created.id }, select: LIST_SELECT });
    });
    return toListItem(version);
  }

  /**
   * Partial update, in one transaction. Given, the artist, composer and
   * lyricist lists replace those credits, tagIds the tags, and content the
   * chart (empty content clears it) - parsed from text, keeping the IDs of
   * everything still there (see reconcileSections) - or `sections` and/or
   * `flow` the chart as the structured editor saves it, IDs as they are. Key, tempo, time
   * signature and duration live in the document; the rest are columns.
   *
   * `revision` is the document revision the editor started from: if the
   * song was saved since (another tab, another admin), the save is refused
   * rather than overwriting their changes.
   */
  async update(user: AuthenticatedUser, id: string, dto: UpdateSongVersionDto): Promise<DetailItem> {
    const existing = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: { documentJson: true },
    });
    if (!existing) throw new NotFoundException("Song version not found");
    if (dto.tagIds) await this.assertTagsUsable(user, dto.tagIds);

    const previous = readSongDocument(existing.documentJson);
    if (dto.revision !== undefined && dto.revision !== previous.revision) throw staleRevision();
    const defaults = defaultsFrom(dto);
    const chart = chartFrom(dto, previous.sections);
    const touchesDocument = dto.content !== undefined || chart !== undefined || Object.keys(defaults).length > 0;
    const content = dto.content?.trim() ? dto.content : "";
    const documentJson = !touchesDocument
      ? null
      : chart
        ? songDocumentFromSections(previous, { ...chart, defaults })
        : songDocumentFromText(previous, {
            content: dto.content === undefined ? undefined : content,
            format: dto.contentFormat ?? detectImportFormat(content),
            defaults,
          });

    // undefined leaves a column alone; null clears it.
    const version = await this.prisma.client.$transaction(async (tx) => {
      if (documentJson) await this.writeDocument(tx, id, existing.documentJson, documentJson);
      await tx.songVersion.update({
        where: { id },
        data: {
          title: dto.title,
          alternateTitle: dto.alternateTitle,
          versionName: dto.versionName,
          sortTitle: dto.sortTitle,
          language: dto.language,
          album: dto.album,
          year: dto.year,
          ccli: dto.ccli,
          isrc: dto.isrc,
          copyright: dto.copyright,
          copyrightYear: dto.copyrightYear,
          publisher: dto.publisher,
          reference: dto.reference,
          notes: dto.notes,
          ...(dto.capo !== undefined && { capo: dto.capo || null }),
        },
      });
      await replaceCredits(tx, id, creditListsFrom(dto));
      if (dto.tagIds) {
        const tagIds = [...new Set(dto.tagIds)];
        await tx.songVersionTag.deleteMany({ where: { songVersionId: id, tagId: { notIn: tagIds } } });
        await tx.songVersionTag.createMany({ data: tagIds.map((tagId) => ({ songVersionId: id, tagId })), skipDuplicates: true });
      }
      return tx.songVersion.findUniqueOrThrow({ where: { id }, select: DETAIL_SELECT });
    });
    return toDetailItem(version, true);
  }

  /**
   * Stores `next` in place of `stored`, but only if nobody else saved in
   * between: the write is conditional on the stored revision (a song not
   * yet upgraded to v2 has none, and is matched as it was).
   */
  private async writeDocument(tx: Prisma.TransactionClient, id: string, stored: Prisma.JsonValue, next: SongDocumentV2) {
    const storedRevision = (stored as { revision?: unknown } | null)?.revision;
    const where: Prisma.SongVersionWhereInput =
      typeof storedRevision === "number"
        ? { id, documentJson: { path: ["revision"], equals: storedRevision } }
        : { id, documentJson: { equals: stored as Prisma.InputJsonValue } };
    const { count } = await tx.songVersion.updateMany({ where, data: { documentJson: next as object } });
    if (count === 0) throw staleRevision();
  }

  /**
   * Replaces this version's content with the result of parsing an uploaded
   * file (bulk upload), keeping IDs where the content is unchanged, and
   * leaving everything else untouched.
   */
  async importText(id: string, content: string, format: SupportedImportFormat): Promise<DetailItem> {
    const existing = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: { documentJson: true },
    });
    if (!existing) throw new NotFoundException("Song version not found");

    const documentJson = songDocumentFromText(readSongDocument(existing.documentJson), { content, format });
    await this.prisma.client.$transaction((tx) => this.writeDocument(tx, id, existing.documentJson, documentJson));
    const version = await this.prisma.client.songVersion.findUniqueOrThrow({ where: { id }, select: DETAIL_SELECT });
    return toDetailItem(version, true);
  }

  /** A ChordPro file of the song: its details from the columns, then the chart. */
  async exportChordPro(id: string): Promise<string> {
    const version = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: {
        title: true,
        alternateTitle: true,
        album: true,
        year: true,
        copyright: true,
        ccli: true,
        capo: true,
        documentJson: true,
        contributors: { select: { source: true, roles: true }, orderBy: { displayOrder: "asc" } },
      },
    });
    if (!version) throw new NotFoundException("Song version not found");
    const credited = (role: ContributorRole) =>
      version.contributors.filter((c) => c.source && c.roles.includes(role)).map((c) => c.source!);
    return songToChordPro(readSongDocument(version.documentJson), {
      title: version.title,
      subtitle: version.alternateTitle,
      artists: credited("PERFORMER"),
      composers: credited("COMPOSER"),
      lyricists: credited("LYRICIST"),
      album: version.album,
      year: version.year,
      copyright: version.copyright,
      ccli: version.ccli,
      capo: version.capo,
    });
  }

  async setStreamingLink(songVersionId: string, type: StreamingIdentifierType, url: string) {
    const { value, sourceUrl } = parseStreamingLink(type, url);
    return this.prisma.client.songVersionIdentifier.upsert({
      where: { songVersionId_type: { songVersionId, type } },
      create: { songVersionId, type, value, sourceUrl, verifiedAt: null },
      update: { value, sourceUrl, verifiedAt: null },
      select: { id: true, type: true, value: true, sourceUrl: true },
    });
  }

  async removeStreamingLink(songVersionId: string, type: StreamingIdentifierType): Promise<void> {
    await this.prisma.client.songVersionIdentifier.deleteMany({ where: { songVersionId, type } });
  }

  /**
   * Deletes a Song Version. A Work has no content of its own — if this
   * was its only version, the Work is deleted with it rather than left
   * behind empty.
   */
  async remove(id: string): Promise<void> {
    const version = await this.prisma.client.songVersion.findUnique({
      where: { id },
      select: { workId: true },
    });
    if (!version) throw new NotFoundException("Song version not found");

    const siblingCount = await this.prisma.client.songVersion.count({
      where: { workId: version.workId, NOT: { id } },
    });

    await this.prisma.client.$transaction(async (tx) => {
      // Clear the Work's preferredOriginalVersionId FK before deleting the
      // version it points to, whether or not the Work itself survives.
      await tx.work.updateMany({
        where: { id: version.workId, preferredOriginalVersionId: id },
        data: { preferredOriginalVersionId: null },
      });
      await tx.songVersion.delete({ where: { id } });
      if (siblingCount === 0) {
        await tx.work.delete({ where: { id: version.workId } });
      }
    });
  }

  async linkMusicBrainzRecording(songVersionId: string, mbid: string) {
    const match = await this.musicBrainz.getRecording(mbid);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.songVersionIdentifier.upsert({
        where: { songVersionId_type: { songVersionId, type: "MUSICBRAINZ_RECORDING" } },
        create: {
          songVersionId,
          type: "MUSICBRAINZ_RECORDING",
          value: mbid,
          sourceUrl: match.sourceUrl,
          verifiedAt: new Date(),
          details: match,
        },
        update: { value: mbid, sourceUrl: match.sourceUrl, verifiedAt: new Date(), details: match },
      });
      await replaceAutoAttachedArtist(tx, songVersionId, match.artist ?? null);
    });
    return match;
  }

  async unlinkMusicBrainzRecording(songVersionId: string) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.songVersionIdentifier.deleteMany({ where: { songVersionId, type: "MUSICBRAINZ_RECORDING" } });
      await replaceAutoAttachedArtist(tx, songVersionId, null);
    });
  }

  /**
   * The linked MusicBrainz recording, as saved when it was linked - no
   * lookup, so showing a song never waits on MusicBrainz (whose rate limit
   * is shared by every user). A link saved before these summaries were
   * kept is looked up once and saved.
   */
  async getMusicBrainzInfo(songVersionId: string): Promise<MusicBrainzRecordingMatch | null> {
    const identifier = await this.prisma.client.songVersionIdentifier.findUnique({
      where: { songVersionId_type: { songVersionId, type: "MUSICBRAINZ_RECORDING" } },
    });
    if (!identifier) return null;
    const saved = MusicBrainzRecordingMatchSchema.safeParse(identifier.details);
    if (saved.success && saved.data.mbid === identifier.value) return saved.data;
    const match = await this.musicBrainz.getRecording(identifier.value);
    await this.prisma.client.songVersionIdentifier.update({ where: { id: identifier.id }, data: { details: match } });
    return match;
  }
}
