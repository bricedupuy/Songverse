import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { readSongDocument } from "@songverse/core";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AddSetlistItemDto,
  CreateSetlistDto,
  UpdateSetlistDto,
  UpdateSetlistItemDto,
} from "./dto/setlist.dto";
import { SetlistAccessService, SONG_SELECT, type SetRow, type SongRow } from "./setlist-access.service";
import { ArrangementsService } from "../arrangements/arrangements.service";
import { setOrder } from "../common/utils/set-order";

const DAY_MS = 24 * 60 * 60 * 1000;
const CANDIDATE_LIMIT = 20;
const NOTE_MAX_LENGTH = 5000;

export interface SongRef {
  id: string;
  title: string;
  /** Tells this version apart from the song's others, e.g. "Acoustic". */
  versionName: string | null;
  workId: string;
  /** The song's own key as written on it, if any. */
  key: string | null;
  ownerScope: "GLOBAL" | "TEAM" | "USER";
  teamName: string | null;
}

const ITEM_INCLUDE = {
  songVersion: { select: SONG_SELECT },
  sharedBy: { select: { id: true, displayName: true } },
  arrangement: { select: { id: true, name: true, documentJson: true, setlistItemId: true } },
  setArrangement: { select: { id: true, name: true } },
} as const;

/**
 * Sets (a.k.a. setlists): an ordered list of song versions for a service or
 * gig, owned by a user or a team, optionally shared with guests by link.
 * Who can see and change what is decided by SetlistAccessService.
 *
 * What can be added to a set is limited to songs its whole audience can
 * open - for a team set, approved global songs and that team's own songs;
 * for a personal set, anything its owner can see. Moving a personal set to
 * a team keeps its owner's other songs in it, shared read-only (see
 * `moveTo()`), until the owner hands them to the team or removes them.
 */
@Injectable()
export class SetlistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sets: SetlistAccessService,
    private readonly arrangements: ArrangementsService,
  ) {}

  async list(user: AuthenticatedUser) {
    const memberships = await this.prisma.client.teamMembership.findMany({
      where: { userId: user.id },
      select: { teamId: true, role: true },
    });
    const rows = await this.prisma.client.setlist.findMany({
      where: {
        OR: [
          { ownerUserId: user.id },
          { ownerTeamId: { in: memberships.map((m) => m.teamId) } },
          { guests: { some: { userId: user.id } } },
        ],
      },
      include: {
        ownerTeam: { select: { name: true } },
        ownerUser: { select: { displayName: true } },
        _count: { select: { items: true } },
      },
    });
    const memberTeams = new Set(memberships.map((m) => m.teamId));
    const adminTeams = new Set(memberships.filter((m) => m.role === "ADMIN").map((m) => m.teamId));

    return sortForDisplay(rows).map((set) => {
      const isGuest = set.ownerUserId !== user.id && !(set.ownerTeamId && memberTeams.has(set.ownerTeamId));
      return {
        ...summarize(set),
        itemCount: set._count.items,
        canEdit: user.isGlobalAdmin || set.ownerUserId === user.id || (!!set.ownerTeamId && adminTeams.has(set.ownerTeamId)),
        isGuest,
      };
    });
  }

  async create(user: AuthenticatedUser, dto: CreateSetlistDto) {
    const eventDate = dto.eventDate ? parseDate(dto.eventDate) : null;
    if (eventDate && eventDate.getTime() < startOfTodayUtc() - DAY_MS) {
      throw new BadRequestException("A new set's date can't be in the past");
    }
    if (dto.teamId) await this.sets.assertTeamAdmin(user, dto.teamId);
    const set = await this.prisma.client.setlist.create({
      data: {
        name: dto.name || null,
        eventDate,
        ownerUserId: dto.teamId ? null : user.id,
        ownerTeamId: dto.teamId ?? null,
      },
      include: { ownerTeam: { select: { name: true } }, ownerUser: { select: { displayName: true } } },
    });
    return { ...summarize(set), itemCount: 0, canEdit: true, isGuest: false };
  }

  async findOne(user: AuthenticatedUser, setlistId: string) {
    const { access } = await this.sets.findViewable(user, setlistId);
    const set = await this.prisma.client.setlist.findUniqueOrThrow({
      where: { id: setlistId },
      include: {
        ownerTeam: { select: { name: true } },
        ownerUser: { select: { displayName: true } },
        items: { orderBy: { position: "asc" }, include: ITEM_INCLUDE },
      },
    });

    const [readable, inViewersLibrary] = await Promise.all([this.sets.readableItems(set, set.items), this.sets.visibilityFor(user)]);

    // Other versions of each song, for the version picker (editors only).
    const siblingsByWork = new Map<string, SongRef[]>();
    if (access.canEdit) {
      const workIds = [...new Set(set.items.map((item) => item.songVersion.workId))];
      const siblings = await this.prisma.client.songVersion.findMany({
        where: { AND: [{ workId: { in: workIds } }, await this.sets.addableWhere(set)] },
        select: SONG_SELECT,
        orderBy: { createdAt: "asc" },
      });
      for (const song of siblings.filter(inViewersLibrary)) {
        siblingsByWork.set(song.workId, [...(siblingsByWork.get(song.workId) ?? []), toSongRef(song)]);
      }
    }

    // The arrangements each song could play in this set (editors only).
    const choices = access.canEdit
      ? await this.arrangements.choicesForSet(set, [...new Set(set.items.map((item) => item.songVersionId))])
      : new Map<string, { id: string; name: string; isTeamDefault: boolean }[]>();


    // Pending requests for the team to take over songs shared into this set.
    const pending = set.ownerTeamId
      ? await this.prisma.client.songOwnershipRequest.findMany({
          where: { teamId: set.ownerTeamId, status: "PENDING", songVersionId: { in: set.items.map((item) => item.songVersionId) } },
          select: { id: true, songVersionId: true },
        })
      : [];
    const pendingBySong = new Map(pending.map((request) => [request.songVersionId, request.id]));

    return {
      ...summarize(set),
      itemCount: set.items.length,
      canEdit: access.canEdit,
      isGuest: access.isGuest,
      items: set.items.map((item) => {
        const song = item.songVersion;
        const shown = readable.has(item.id) || inViewersLibrary(song);
        const sharedPersonalSong = !!set.ownerTeamId && song.ownerScope === "USER" && !!song.ownerUserId;
        const requestId = pendingBySong.get(song.id) ?? null;
        return {
          id: item.id,
          position: item.position,
          transposeSteps: item.transposeSteps,
          notes: item.notes,
          // Null when this viewer can't read the song (shown as a placeholder).
          song: shown ? toSongRef(song) : null,
          // Whether it's also in the viewer's own library, i.e. openable outside the set.
          inLibrary: inViewersLibrary(song),
          sharedBy: shown && item.sharedBy ? { id: item.sharedBy.id, displayName: item.sharedBy.displayName } : null,
          ownershipRequest: requestId ? { id: requestId, canDecide: song.ownerUserId === user.id } : null,
          // A team admin can ask for (or, owning it, hand over) a personal song shared into a team set.
          canRequestOwnership: access.canEdit && shown && sharedPersonalSong && !requestId,
          versions: siblingsByWork.get(song.workId) ?? [],
          // The arrangement it's played in (null: as written), and the others it could be.
          arrangement: shown && item.arrangement ? arrangementRef(item.arrangement) : null,
          // Plus its own arrangement for this set, if it has one.
          arrangements: access.canEdit
            ? [
                ...(choices.get(song.id) ?? []).map((choice) => ({ ...choice, setOnly: false })),
                ...(item.setArrangement ? [{ ...item.setArrangement, isTeamDefault: false, setOnly: true }] : []),
              ]
            : [],
        };
      }),
    };
  }

  async update(user: AuthenticatedUser, setlistId: string, dto: UpdateSetlistDto) {
    const set = await this.sets.findEditable(user, setlistId);
    if (dto.teamId !== undefined && dto.teamId !== set.ownerTeamId) {
      await this.moveTo(user, set, dto.teamId);
    }
    await this.prisma.client.setlist.update({
      where: { id: setlistId },
      data: {
        ...(dto.name !== undefined && { name: dto.name || null }),
        ...(dto.eventDate !== undefined && { eventDate: dto.eventDate === null ? null : parseDate(dto.eventDate) }),
      },
    });
    return this.findOne(user, setlistId);
  }

  /**
   * Hands a set to a team (`teamId`), or to the acting user as a personal
   * set (`null`). Songs the new owner couldn't add themselves stay in it,
   * marked as shared by whoever could see them - the previous owner, when
   * a personal set moves to a team - so its audience can still read them.
   * Marks no longer needed (the song is now addable anyway) are cleared.
   */
  private async moveTo(user: AuthenticatedUser, set: SetRow, teamId: string | null): Promise<void> {
    if (teamId) await this.sets.assertTeamAdmin(user, teamId);
    const next: SetRow = { id: set.id, ownerUserId: teamId ? null : user.id, ownerTeamId: teamId };
    const items = await this.prisma.client.setlistItem.findMany({
      where: { setlistId: set.id },
      select: { id: true, sharedByUserId: true, songVersion: { select: SONG_SELECT } },
    });
    const [addable, actorSees] = await Promise.all([this.sets.addableIn(next), this.sets.visibilityFor(user)]);
    const sharer = set.ownerUserId ?? user.id;

    await this.prisma.client.$transaction(async (tx) => {
      await tx.setlist.update({ where: { id: set.id }, data: { ownerUserId: next.ownerUserId, ownerTeamId: next.ownerTeamId } });
      // Its songs' own arrangements for it belong to whoever owns the set.
      await tx.arrangement.updateMany({
        where: { setlistItem: { setlistId: set.id } },
        data: { ownerScope: teamId ? "TEAM" : "USER", ownerUserId: next.ownerUserId, ownerTeamId: next.ownerTeamId },
      });
      for (const item of items) {
        const sharedByUserId = addable(item.songVersion) ? null : (item.sharedByUserId ?? (actorSees(item.songVersion) ? sharer : null));
        if (sharedByUserId !== item.sharedByUserId) {
          await tx.setlistItem.update({ where: { id: item.id }, data: { sharedByUserId } });
        }
      }
      // Being a guest of a set that's now your own (or your team's) is moot.
      await tx.setlistGuest.deleteMany({
        where: {
          setlistId: set.id,
          ...(teamId ? { user: { teamMemberships: { some: { teamId } } } } : { userId: user.id }),
        },
      });
    });
  }

  async remove(user: AuthenticatedUser, setlistId: string): Promise<void> {
    await this.sets.findEditable(user, setlistId);
    await this.prisma.client.setlist.delete({ where: { id: setlistId } });
  }

  /** Songs that can be added to this set, optionally filtered by title. */
  async candidates(user: AuthenticatedUser, setlistId: string, query: string | undefined) {
    const set = await this.sets.findEditable(user, setlistId);
    const search = query?.trim();
    const songs = await this.prisma.client.songVersion.findMany({
      where: {
        AND: [await this.sets.addableWhere(set), ...(search ? [{ title: { contains: search, mode: "insensitive" as const } }] : [])],
      },
      select: SONG_SELECT,
      orderBy: search ? { title: "asc" } : { updatedAt: "desc" },
      take: CANDIDATE_LIMIT,
    });
    return songs.map(toSongRef);
  }

  async addItem(user: AuthenticatedUser, setlistId: string, dto: AddSetlistItemDto) {
    const set = await this.sets.findEditable(user, setlistId);
    await this.assertAddable(set, dto.songVersionId);
    await this.prisma.client.$transaction(async (tx) => {
      const position = await tx.setlistItem.count({ where: { setlistId } });
      // A team set plays the team's usual arrangement of the song, if it has one.
      const arrangementId = set.ownerTeamId ? await this.arrangements.teamDefaultId(set.ownerTeamId, dto.songVersionId) : null;
      await tx.setlistItem.create({
        data: { setlistId, songVersionId: dto.songVersionId, transposeSteps: dto.transposeSteps ?? 0, position, arrangementId },
      });
    });
    return this.findOne(user, setlistId);
  }

  async updateItem(user: AuthenticatedUser, setlistId: string, itemId: string, dto: UpdateSetlistItemDto) {
    const set = await this.sets.findEditable(user, setlistId);
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
    // Another version plays the team's usual arrangement of it (an arrangement belongs to one version).
    const switching = dto.songVersionId !== undefined && dto.songVersionId !== item.songVersionId;
    const songVersionId = switching ? dto.songVersionId! : item.songVersionId;
    let arrangementId: string | null | undefined = switching
      ? set.ownerTeamId
        ? await this.arrangements.teamDefaultId(set.ownerTeamId, songVersionId)
        : null
      : undefined;
    if (dto.arrangementId !== undefined) {
      if (dto.arrangementId) await this.arrangements.assertPlayableInSet(set, songVersionId, dto.arrangementId, itemId);
      arrangementId = dto.arrangementId;
    }
    await this.prisma.client.$transaction(async (tx) => {
      // Its own arrangement for this set was of the other version.
      if (switching) await tx.arrangement.deleteMany({ where: { setlistItemId: itemId } });
      await tx.setlistItem.update({
      where: { id: itemId },
      data: {
        // A version picked from what's addable needs no sharing.
        ...(switching && { songVersionId, sharedByUserId: null }),
        ...(arrangementId !== undefined && { arrangementId }),
        ...(dto.transposeSteps !== undefined && { transposeSteps: dto.transposeSteps }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
      },
      });
    });
    return this.findOne(user, setlistId);
  }

  /**
   * Gives a song of the set its own arrangement for this set (issue #16:
   * reorder, skip or repeat its sections just here) and plays it: a copy of
   * the arrangement it played, or the song's order. Returns its id, to open
   * in the arrangement editor.
   */
  async setArrangement(user: AuthenticatedUser, setlistId: string, itemId: string, name: string) {
    const set = await this.sets.findEditable(user, setlistId);
    const item = await this.findItem(setlistId, itemId);
    return { arrangementId: await this.arrangements.forSetItem(user, set, item, name) };
  }

  async removeItem(user: AuthenticatedUser, setlistId: string, itemId: string) {
    await this.sets.findEditable(user, setlistId);
    await this.findItem(setlistId, itemId);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.setlistItem.delete({ where: { id: itemId } });
      const remaining = await tx.setlistItem.findMany({ where: { setlistId }, orderBy: { position: "asc" }, select: { id: true } });
      await setOrder(tx, "SetlistItem", remaining.map(({ id }) => id));
    });
    return this.findOne(user, setlistId);
  }

  /** `itemIds` must list every item of the set exactly once. */
  async reorder(user: AuthenticatedUser, setlistId: string, itemIds: string[]) {
    await this.sets.findEditable(user, setlistId);
    const existing = await this.prisma.client.setlistItem.findMany({ where: { setlistId }, select: { id: true } });
    const existingIds = new Set(existing.map((item) => item.id));
    if (itemIds.length !== existingIds.size || !itemIds.every((id) => existingIds.has(id))) {
      throw new BadRequestException("itemIds must list every item of the set exactly once");
    }
    await setOrder(this.prisma.client, "SetlistItem", itemIds);
    return this.findOne(user, setlistId);
  }

  /**
   * One song of a set, as anyone who can open the set sees it - including
   * guests, and songs that aren't in the viewer's own library - with the
   * viewer's private notes on it and its neighbours in the set.
   */
  async songView(user: AuthenticatedUser, setlistId: string, itemId: string) {
    const { access } = await this.sets.findViewable(user, setlistId);
    const set = await this.prisma.client.setlist.findUniqueOrThrow({
      where: { id: setlistId },
      include: {
        ownerTeam: { select: { name: true } },
        ownerUser: { select: { displayName: true } },
        items: { orderBy: { position: "asc" }, include: ITEM_INCLUDE },
      },
    });
    const index = set.items.findIndex((item) => item.id === itemId);
    if (index === -1) throw new NotFoundException("Item not found");
    const item = set.items[index]!;
    const next = set.items[index + 1];

    const [readable, inViewersLibrary, note, viewer] = await Promise.all([
      this.sets.readableItems(set, next ? [item, next] : [item]),
      this.sets.visibilityFor(user),
      this.myNoteRow(user.id, itemId),
      this.prisma.client.user.findUnique({ where: { id: user.id }, select: { chordNotation: true, capoDisplayMode: true } }),
    ]);
    const song = item.songVersion;
    const shown = readable.has(item.id) || inViewersLibrary(song);
    const document = shown ? readSongDocument(song.documentJson) : null;
    // Played as the set says: anyone who can open the set sees the arrangement it plays.
    const arrangement = document && item.arrangementId ? await this.arrangements.forChart(item.arrangementId, document) : null;
    const preferences = shown ? await this.arrangements.preferences(user.id, song.id, arrangement?.id ?? null) : null;

    return {
      set: { ...summarize(set), itemCount: set.items.length, canEdit: access.canEdit, isGuest: access.isGuest },
      item: { id: item.id, position: item.position, transposeSteps: item.transposeSteps, notes: item.notes, arrangementId: arrangement?.id ?? null },
      song: shown
        ? {
            ...toSongRef(song),
            tempo: document?.defaults.tempo ?? null,
            sections: document?.sections ?? [],
            // The order it's sung in, each pass pointing at a section above.
            flow: document?.flow ?? [],
            // The whole document, for renderChart() (key, revision, flow and all).
            document,
            // A capo written on the song: only a suggestion, when the arrangement sets none.
            suggestedCapo: song.capo ?? null,
          }
        : null,
      arrangement,
      // How this player reads it: their preferences for this chart, and their chord display settings.
      view: {
        preferences,
        chordNotation: viewer?.chordNotation ?? "LETTERS",
        capoDisplayMode: viewer?.capoDisplayMode ?? "SOUNDING",
      },
      inLibrary: inViewersLibrary(song),
      sharedBy: shown && item.sharedBy ? { id: item.sharedBy.id, displayName: item.sharedBy.displayName } : null,
      previousItemId: set.items[index - 1]?.id ?? null,
      nextItemId: next?.id ?? null,
      // What's coming, for Perform mode - unless the viewer can't read that song.
      nextTitle: next && (readable.has(next.id) || inViewersLibrary(next.songVersion)) ? next.songVersion.title : null,
      myNote: note?.content ?? "",
    };
  }

  /** The viewer's own chart preferences for one song of the set, as the set plays it (guests too). */
  async setMyChartPreferences(user: AuthenticatedUser, setlistId: string, itemId: string, preferences: unknown) {
    await this.sets.findViewable(user, setlistId);
    const item = await this.findItem(setlistId, itemId);
    return this.arrangements.savePreferences(user.id, item.songVersionId, item.arrangementId, preferences);
  }

  /** The viewer's private note on one song of the set; an empty one deletes it. */
  async setMyNote(user: AuthenticatedUser, setlistId: string, itemId: string, content: string): Promise<{ myNote: string }> {
    await this.sets.findViewable(user, setlistId);
    await this.findItem(setlistId, itemId);
    const text = content.trim();
    if (text.length > NOTE_MAX_LENGTH) throw new BadRequestException(`Notes are limited to ${NOTE_MAX_LENGTH} characters`);
    const existing = await this.myNoteRow(user.id, itemId);
    if (!text) {
      if (existing) await this.prisma.client.note.delete({ where: { id: existing.id } });
      return { myNote: "" };
    }
    if (existing) {
      await this.prisma.client.note.update({ where: { id: existing.id }, data: { content: text } });
    } else {
      await this.prisma.client.note.create({ data: { scope: "SETLIST_ITEM", content: text, authorUserId: user.id, setlistItemId: itemId } });
    }
    return { myNote: text };
  }

  // Private to its author for now; one per person per song in the set.
  private myNoteRow(userId: string, itemId: string) {
    return this.prisma.client.note.findFirst({
      where: { scope: "SETLIST_ITEM", setlistItemId: itemId, authorUserId: userId },
      select: { id: true, content: true },
    });
  }

  private async findItem(setlistId: string, itemId: string) {
    const item = await this.prisma.client.setlistItem.findUnique({ where: { id: itemId } });
    if (!item || item.setlistId !== setlistId) throw new NotFoundException("Item not found");
    return item;
  }

  private async assertAddable(set: SetRow, songVersionId: string): Promise<void> {
    const count = await this.prisma.client.songVersion.count({ where: { AND: [{ id: songVersionId }, await this.sets.addableWhere(set)] } });
    if (count === 0) {
      throw new BadRequestException(
        set.ownerTeamId
          ? "A team set can only include approved global songs and the team's own songs"
          : "Song not found or not visible to the set's owner",
      );
    }
  }
}

export function toSongRef(song: SongRow): SongRef {
  const defaults = (song.documentJson as { defaults?: { key?: unknown } } | null)?.defaults;
  return {
    id: song.id,
    title: song.title,
    versionName: song.versionName,
    workId: song.workId,
    key: typeof defaults?.key === "string" && defaults.key.trim() ? defaults.key.trim() : null,
    ownerScope: song.ownerScope,
    teamName: song.ownerTeam?.name ?? null,
  };
}

/** A set item's arrangement: its name, and the key it moves the song to (the item's own key goes on top). */
function arrangementRef(arrangement: { id: string; name: string; documentJson: unknown; setlistItemId: string | null }) {
  const steps = (arrangement.documentJson as { defaults?: { transposeSteps?: unknown } } | null)?.defaults?.transposeSteps;
  return { id: arrangement.id, name: arrangement.name, transposeSteps: typeof steps === "number" ? steps : 0, setOnly: !!arrangement.setlistItemId };
}

export function summarize(set: {
  id: string;
  name: string | null;
  eventDate: Date | null;
  ownerTeamId: string | null;
  ownerTeam?: { name: string } | null;
  ownerUser?: { displayName: string } | null;
}) {
  return {
    id: set.id,
    name: set.name,
    eventDate: set.eventDate ? formatDate(set.eventDate) : null,
    teamId: set.ownerTeamId,
    teamName: set.ownerTeam?.name ?? null,
    // Whose personal set it is, for guests.
    ownerName: set.ownerTeamId ? null : (set.ownerUser?.displayName ?? null),
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
