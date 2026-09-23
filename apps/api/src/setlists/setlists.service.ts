import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@songverse/db";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AddSetlistItemDto,
  CreateSetlistDto,
  UpdateSetlistDto,
  UpdateSetlistItemDto,
} from "./dto/setlist.dto";

const DAY_MS = 24 * 60 * 60 * 1000;
const CANDIDATE_LIMIT = 20;

const SONG_SELECT = {
  id: true,
  title: true,
  workId: true,
  ownerScope: true,
  ownerUserId: true,
  ownerTeamId: true,
  publicationState: true,
  documentJson: true,
  ownerTeam: { select: { name: true } },
} satisfies Prisma.SongVersionSelect;

type SongRow = Prisma.SongVersionGetPayload<{ select: typeof SONG_SELECT }>;
type SetRow = { id: string; ownerUserId: string | null; ownerTeamId: string | null };

export interface SongRef {
  id: string;
  title: string;
  workId: string;
  /** The song's own key as written on it, if any. */
  key: string | null;
  ownerScope: "GLOBAL" | "TEAM" | "USER";
  teamName: string | null;
}

/**
 * Sets (a.k.a. setlists): an ordered list of song versions for a service or
 * gig, owned by a user or a team. Same access rules as songbooks: team
 * members can view a team's sets, team admins edit them.
 *
 * What can go in a set is limited to songs its whole audience can open - for
 * a team set, approved global songs and that team's own songs; for a personal
 * set, anything its owner can see. Viewers still only get details of songs
 * visible to them, in case a song's visibility changes afterwards.
 */
@Injectable()
export class SetlistsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser) {
    const memberships = await this.prisma.client.teamMembership.findMany({
      where: { userId: user.id },
      select: { teamId: true, role: true },
    });
    const sets = await this.prisma.client.setlist.findMany({
      where: { OR: [{ ownerUserId: user.id }, { ownerTeamId: { in: memberships.map((m) => m.teamId) } }] },
      include: { ownerTeam: { select: { name: true } }, _count: { select: { items: true } } },
    });
    const adminTeams = new Set(memberships.filter((m) => m.role === "ADMIN").map((m) => m.teamId));

    return sortForDisplay(sets).map((set) => ({
      ...summarize(set, set.ownerTeam?.name ?? null),
      itemCount: set._count.items,
      canEdit: user.isGlobalAdmin || set.ownerUserId === user.id || (!!set.ownerTeamId && adminTeams.has(set.ownerTeamId)),
    }));
  }

  async create(user: AuthenticatedUser, dto: CreateSetlistDto) {
    const eventDate = dto.eventDate ? parseDate(dto.eventDate) : null;
    if (eventDate && eventDate.getTime() < startOfTodayUtc() - DAY_MS) {
      throw new BadRequestException("A new set's date can't be in the past");
    }
    let teamName: string | null = null;
    if (dto.teamId) {
      await this.assertTeamAdmin(user, dto.teamId);
      teamName = (await this.prisma.client.team.findUniqueOrThrow({ where: { id: dto.teamId }, select: { name: true } })).name;
    }
    const set = await this.prisma.client.setlist.create({
      data: {
        name: dto.name || null,
        eventDate,
        ownerUserId: dto.teamId ? null : user.id,
        ownerTeamId: dto.teamId ?? null,
      },
    });
    return { ...summarize(set, teamName), itemCount: 0, canEdit: true };
  }

  async findOne(user: AuthenticatedUser, setlistId: string) {
    const set = await this.prisma.client.setlist.findUnique({
      where: { id: setlistId },
      include: {
        ownerTeam: { select: { name: true } },
        items: { orderBy: { position: "asc" }, include: { songVersion: { select: SONG_SELECT } } },
      },
    });
    if (!set) throw new NotFoundException("Set not found");
    const access = await this.access(user, set);
    if (!access.canView) throw new NotFoundException("Set not found");

    const viewerTeams = await this.teamIdsOf(user.id);
    const visible = (song: SongRow) => isVisibleTo(user, viewerTeams, song);

    // Other versions of each song, for the version picker (editors only).
    const siblingsByWork = new Map<string, SongRef[]>();
    if (access.canEdit) {
      const workIds = [...new Set(set.items.map((item) => item.songVersion.workId))];
      const siblings = await this.prisma.client.songVersion.findMany({
        where: { AND: [{ workId: { in: workIds } }, await this.addableWhere(set)] },
        select: SONG_SELECT,
        orderBy: { createdAt: "asc" },
      });
      for (const song of siblings.filter(visible)) {
        siblingsByWork.set(song.workId, [...(siblingsByWork.get(song.workId) ?? []), toSongRef(song)]);
      }
    }

    return {
      ...summarize(set, set.ownerTeam?.name ?? null),
      itemCount: set.items.length,
      canEdit: access.canEdit,
      items: set.items.map((item) => ({
        id: item.id,
        position: item.position,
        transposeSteps: item.transposeSteps,
        notes: item.notes,
        // Null when this viewer can't see the song (shown as a placeholder).
        song: visible(item.songVersion) ? toSongRef(item.songVersion) : null,
        versions: siblingsByWork.get(item.songVersion.workId) ?? [],
      })),
    };
  }

  async update(user: AuthenticatedUser, setlistId: string, dto: UpdateSetlistDto) {
    await this.findEditable(user, setlistId);
    await this.prisma.client.setlist.update({
      where: { id: setlistId },
      data: {
        ...(dto.name !== undefined && { name: dto.name || null }),
        ...(dto.eventDate !== undefined && { eventDate: dto.eventDate === null ? null : parseDate(dto.eventDate) }),
      },
    });
    return this.findOne(user, setlistId);
  }

  async remove(user: AuthenticatedUser, setlistId: string): Promise<void> {
    await this.findEditable(user, setlistId);
    await this.prisma.client.setlist.delete({ where: { id: setlistId } });
  }

  /** Songs that can be added to this set, optionally filtered by title. */
  async candidates(user: AuthenticatedUser, setlistId: string, query: string | undefined) {
    const set = await this.findEditable(user, setlistId);
    const search = query?.trim();
    const songs = await this.prisma.client.songVersion.findMany({
      where: {
        AND: [await this.addableWhere(set), ...(search ? [{ title: { contains: search, mode: "insensitive" as const } }] : [])],
      },
      select: SONG_SELECT,
      orderBy: search ? { title: "asc" } : { updatedAt: "desc" },
      take: CANDIDATE_LIMIT,
    });
    return songs.map(toSongRef);
  }

  async addItem(user: AuthenticatedUser, setlistId: string, dto: AddSetlistItemDto) {
    const set = await this.findEditable(user, setlistId);
    await this.assertAddable(set, dto.songVersionId);
    await this.prisma.client.$transaction(async (tx) => {
      const position = await tx.setlistItem.count({ where: { setlistId } });
      await tx.setlistItem.create({
        data: { setlistId, songVersionId: dto.songVersionId, transposeSteps: dto.transposeSteps ?? 0, position },
      });
    });
    return this.findOne(user, setlistId);
  }

  async updateItem(user: AuthenticatedUser, setlistId: string, itemId: string, dto: UpdateSetlistItemDto) {
    const set = await this.findEditable(user, setlistId);
    const item = await this.findItem(setlistId, itemId);
    if (dto.songVersionId !== undefined && dto.songVersionId !== item.songVersionId) {
      const [current, next] = await Promise.all([
        this.prisma.client.songVersion.findUniqueOrThrow({ where: { id: item.songVersionId }, select: { workId: true } }),
        this.prisma.client.songVersion.findUnique({ where: { id: dto.songVersionId }, select: { workId: true } }),
      ]);
      if (!next || next.workId !== current.workId) {
        throw new BadRequestException("Can only switch to another version of the same song");
      }
      await this.assertAddable(set, dto.songVersionId);
    }
    await this.prisma.client.setlistItem.update({
      where: { id: itemId },
      data: {
        ...(dto.songVersionId !== undefined && { songVersionId: dto.songVersionId }),
        ...(dto.transposeSteps !== undefined && { transposeSteps: dto.transposeSteps }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
      },
    });
    return this.findOne(user, setlistId);
  }

  async removeItem(user: AuthenticatedUser, setlistId: string, itemId: string) {
    await this.findEditable(user, setlistId);
    await this.findItem(setlistId, itemId);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.setlistItem.delete({ where: { id: itemId } });
      const remaining = await tx.setlistItem.findMany({ where: { setlistId }, orderBy: { position: "asc" }, select: { id: true } });
      await Promise.all(remaining.map(({ id }, position) => tx.setlistItem.update({ where: { id }, data: { position } })));
    });
    return this.findOne(user, setlistId);
  }

  /** `itemIds` must list every item of the set exactly once. */
  async reorder(user: AuthenticatedUser, setlistId: string, itemIds: string[]) {
    await this.findEditable(user, setlistId);
    const existing = await this.prisma.client.setlistItem.findMany({ where: { setlistId }, select: { id: true } });
    const existingIds = new Set(existing.map((item) => item.id));
    if (itemIds.length !== existingIds.size || !itemIds.every((id) => existingIds.has(id))) {
      throw new BadRequestException("itemIds must list every item of the set exactly once");
    }
    await this.prisma.client.$transaction(
      itemIds.map((id, position) => this.prisma.client.setlistItem.update({ where: { id }, data: { position } })),
    );
    return this.findOne(user, setlistId);
  }

  private async findEditable(user: AuthenticatedUser, setlistId: string): Promise<SetRow> {
    const set = await this.prisma.client.setlist.findUnique({
      where: { id: setlistId },
      select: { id: true, ownerUserId: true, ownerTeamId: true },
    });
    if (!set) throw new NotFoundException("Set not found");
    const access = await this.access(user, set);
    if (!access.canView) throw new NotFoundException("Set not found");
    if (!access.canEdit) throw new ForbiddenException("Only the set's owner or a team admin can change it");
    return set;
  }

  private async findItem(setlistId: string, itemId: string) {
    const item = await this.prisma.client.setlistItem.findUnique({ where: { id: itemId } });
    if (!item || item.setlistId !== setlistId) throw new NotFoundException("Item not found");
    return item;
  }

  private async access(user: AuthenticatedUser, set: SetRow): Promise<{ canView: boolean; canEdit: boolean }> {
    if (user.isGlobalAdmin || set.ownerUserId === user.id) return { canView: true, canEdit: true };
    if (!set.ownerTeamId) return { canView: false, canEdit: false };
    const membership = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId: set.ownerTeamId, userId: user.id } },
      select: { role: true },
    });
    return { canView: !!membership, canEdit: membership?.role === "ADMIN" };
  }

  private async assertTeamAdmin(user: AuthenticatedUser, teamId: string): Promise<void> {
    if (user.isGlobalAdmin) {
      const team = await this.prisma.client.team.findUnique({ where: { id: teamId }, select: { id: true } });
      if (!team) throw new NotFoundException("Team not found");
      return;
    }
    const membership = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId: user.id } },
      select: { role: true },
    });
    if (membership?.role !== "ADMIN") throw new ForbiddenException("Team admin role required to create a team set");
  }

  /** Songs everyone who can open this set can also open (see the class comment). */
  private async addableWhere(set: SetRow): Promise<Prisma.SongVersionWhereInput> {
    const approvedGlobal: Prisma.SongVersionWhereInput = { ownerScope: "GLOBAL", publicationState: "APPROVED" };
    if (set.ownerTeamId) {
      return { OR: [approvedGlobal, { ownerScope: "TEAM", ownerTeamId: set.ownerTeamId }] };
    }
    const ownerTeams = await this.teamIdsOf(set.ownerUserId!);
    return {
      OR: [
        approvedGlobal,
        { ownerScope: "USER", ownerUserId: set.ownerUserId },
        { ownerScope: "TEAM", ownerTeamId: { in: [...ownerTeams] } },
      ],
    };
  }

  private async assertAddable(set: SetRow, songVersionId: string): Promise<void> {
    const count = await this.prisma.client.songVersion.count({ where: { AND: [{ id: songVersionId }, await this.addableWhere(set)] } });
    if (count === 0) {
      throw new BadRequestException(
        set.ownerTeamId
          ? "A team set can only include approved global songs and the team's own songs"
          : "Song not found or not visible to the set's owner",
      );
    }
  }

  private async teamIdsOf(userId: string): Promise<Set<string>> {
    const memberships = await this.prisma.client.teamMembership.findMany({ where: { userId }, select: { teamId: true } });
    return new Set(memberships.map((m) => m.teamId));
  }
}

function isVisibleTo(user: AuthenticatedUser, viewerTeams: Set<string>, song: SongRow): boolean {
  if (user.isGlobalAdmin) return true;
  if (song.ownerScope === "GLOBAL") return song.publicationState === "APPROVED";
  if (song.ownerScope === "USER") return song.ownerUserId === user.id;
  return !!song.ownerTeamId && viewerTeams.has(song.ownerTeamId);
}

function toSongRef(song: SongRow): SongRef {
  const defaults = (song.documentJson as { defaults?: { key?: unknown } } | null)?.defaults;
  return {
    id: song.id,
    title: song.title,
    workId: song.workId,
    key: typeof defaults?.key === "string" && defaults.key.trim() ? defaults.key.trim() : null,
    ownerScope: song.ownerScope,
    teamName: song.ownerTeam?.name ?? null,
  };
}

function summarize(set: { id: string; name: string | null; eventDate: Date | null; ownerTeamId: string | null }, teamName: string | null) {
  return {
    id: set.id,
    name: set.name,
    eventDate: set.eventDate ? formatDate(set.eventDate) : null,
    teamId: set.ownerTeamId,
    teamName,
  };
}

/** Upcoming sets first (soonest first), then undated ones (newest first), then past ones (most recent first). */
function sortForDisplay<T extends { eventDate: Date | null; createdAt: Date }>(sets: T[]): T[] {
  const today = startOfTodayUtc();
  const group = (set: T) => (set.eventDate === null ? 1 : set.eventDate.getTime() >= today ? 0 : 2);
  return [...sets].sort((a, b) => {
    const byGroup = group(a) - group(b);
    if (byGroup !== 0) return byGroup;
    if (group(a) === 0) return a.eventDate!.getTime() - b.eventDate!.getTime();
    if (group(a) === 2) return b.eventDate!.getTime() - a.eventDate!.getTime();
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** "YYYY-MM-DD" to a UTC-midnight Date, rejecting impossible dates like 2026-02-31. */
function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatDate(date) !== value) {
    throw new BadRequestException(`Invalid date: ${value}`);
  }
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
