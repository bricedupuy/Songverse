import { createHash } from "node:crypto";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccessPolicyService } from "../access/access-policy.service";
import { AttachmentsService } from "../attachments/attachments.service";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { PrismaService } from "../prisma/prisma.service";
import { SetlistsService } from "../setlists/setlists.service";
import { SongbooksService } from "../songbooks/songbooks.service";
import { SongVersionsService } from "../song-versions/song-versions.service";
import type { OfflinePinDto, OfflineSyncDto, PinKind } from "./dto/offline.dto";

const DAY_MS = 24 * 60 * 60 * 1000;

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

/** Not found and not visible look the same to a device: either way, it goes. */
function isGone(error: unknown): boolean {
  return error instanceof NotFoundException || error instanceof ForbiddenException;
}

/**
 * What each user's devices keep offline (docs/offline.md, issues #51 and
 * #52): their pins, and the sync that tells a device what to download,
 * update and remove - the same protocol for the web and mobile apps.
 */
@Injectable()
export class OfflineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
    private readonly setlists: SetlistsService,
    private readonly songs: SongVersionsService,
    private readonly songbooks: SongbooksService,
    private readonly attachments: AttachmentsService,
  ) {}

  listPins(user: AuthenticatedUser) {
    return this.prisma.client.offlinePin.findMany({
      where: { userId: user.id },
      select: { kind: true, targetId: true, includeAudio: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Pins something the user can open (and sets whether its audio comes too). */
  async pin(user: AuthenticatedUser, dto: OfflinePinDto) {
    if (dto.kind === "SET") await this.setlists.findOne(user, dto.targetId);
    else if (dto.kind === "SONG") await this.songs.findOne(user, dto.targetId);
    else await this.songbooks.findOne(user, dto.targetId);
    return this.prisma.client.offlinePin.upsert({
      where: { userId_kind_targetId: { userId: user.id, kind: dto.kind, targetId: dto.targetId } },
      create: { userId: user.id, kind: dto.kind, targetId: dto.targetId, includeAudio: dto.includeAudio ?? false },
      update: { includeAudio: dto.includeAudio ?? false },
      select: { kind: true, targetId: true, includeAudio: true, createdAt: true },
    });
  }

  async unpin(user: AuthenticatedUser, kind: PinKind, targetId: string) {
    await this.prisma.client.offlinePin.deleteMany({ where: { userId: user.id, kind, targetId } });
  }

  /** A song to keep offline: its details and its files' list, and a version that changes when either does. */
  async songCopy(user: AuthenticatedUser, songVersionId: string) {
    const song = await this.songs.findOne(user, songVersionId);
    const attachments = await this.attachments.listForSongVersion(user, songVersionId);
    return { song, attachments, version: songVersion(song.updatedAt, attachments) };
  }

  async songbookCopy(user: AuthenticatedUser, songbookId: string) {
    const songbook = await this.songbooks.findOne(user, songbookId);
    return { songbook, version: hash(songbook) };
  }

  /** Several songs at once (up to 100); ones that can't be opened are left out. */
  async songCopies(user: AuthenticatedUser, ids: string[]) {
    const copies = [];
    for (const id of new Set(ids)) {
      try {
        copies.push(await this.songCopy(user, id));
      } catch (error) {
        if (!isGone(error)) throw error;
      }
    }
    return copies;
  }

  /**
   * What a device should keep now. It sends what it keeps with the versions
   * it has; each list comes back with current versions, a copy only where
   * the device's is out of date, and what's `gone` (deleted, no longer
   * visible, unpinned) for the device to remove.
   *
   * - Sets: dated from yesterday to `days` ahead, pinned, or already kept
   *   (opened) and still visible.
   * - Songbooks: pinned ("Keep a local copy").
   * - Songs: the user's own, pinned, in a kept songbook, or in a kept set -
   *   with `audio` when a pin asks for their audio files.
   */
  async sync(user: AuthenticatedUser, dto: OfflineSyncDto) {
    const days = dto.days ?? 14;
    const pins = await this.listPins(user);
    const pinned = (kind: PinKind) => pins.filter((pin) => pin.kind === kind);

    // --- sets
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const from = new Date(today - DAY_MS).toISOString().slice(0, 10);
    const to = new Date(today + days * DAY_MS).toISOString().slice(0, 10);
    const upcoming = (await this.setlists.list(user)).filter((set) => set.eventDate && set.eventDate >= from && set.eventDate <= to).map((set) => set.id);
    const knownSets = new Map((dto.known ?? []).map((set) => [set.id, set.version]));
    const sets: { id: string; version: string; copy?: Awaited<ReturnType<SetlistsService["offlineCopy"]>> }[] = [];
    const gone: string[] = [];
    const setSongIds = new Map<string, string[]>();
    for (const id of new Set([...upcoming, ...pinned("SET").map((pin) => pin.targetId), ...knownSets.keys()])) {
      try {
        const copy = await this.setlists.offlineCopy(user, id);
        setSongIds.set(id, copy.songs.flatMap((view) => (view.song ? [view.song.id] : [])));
        sets.push(copy.version === knownSets.get(id) ? { id, version: copy.version } : { id, version: copy.version, copy });
      } catch (error) {
        if (isGone(error)) gone.push(id);
        else throw error;
      }
    }

    // --- songbooks
    const knownSongbooks = new Map((dto.knownSongbooks ?? []).map((book) => [book.id, book.version]));
    const songbooks: { id: string; version: string; copy?: Awaited<ReturnType<OfflineService["songbookCopy"]>> }[] = [];
    const bookSongIds = new Map<string, string[]>();
    for (const pin of pinned("SONGBOOK")) {
      try {
        const copy = await this.songbookCopy(user, pin.targetId);
        bookSongIds.set(pin.targetId, copy.songbook.entries.map((entry) => entry.songVersionId));
        songbooks.push(copy.version === knownSongbooks.get(pin.targetId) ? { id: pin.targetId, version: copy.version } : { id: pin.targetId, version: copy.version, copy });
      } catch (error) {
        if (!isGone(error)) throw error;
      }
    }
    const goneSongbooks = [...knownSongbooks.keys()].filter((id) => !songbooks.some((book) => book.id === id));

    // --- songs: which, and whether with their audio
    const audio = new Set<string>();
    const wanted = new Set<string>();
    const own = await this.prisma.client.songVersion.findMany({
      where: { AND: [await this.access.songsVisibleTo(user), { ownerScope: "USER", ownerUserId: user.id }] },
      select: { id: true },
    });
    for (const { id } of own) wanted.add(id);
    for (const pin of pinned("SONG")) {
      wanted.add(pin.targetId);
      if (pin.includeAudio) audio.add(pin.targetId);
    }
    for (const [kind, lists] of [
      ["SONGBOOK", bookSongIds],
      ["SET", setSongIds],
    ] as const) {
      for (const [id, songIds] of lists) {
        const withAudio = pins.some((pin) => pin.kind === kind && pin.targetId === id && pin.includeAudio);
        for (const songId of songIds) {
          wanted.add(songId);
          if (withAudio) audio.add(songId);
        }
      }
    }
    // Versions in one query; full copies only for what the device doesn't have.
    // Only the files this user sees (issue #72).
    const visibleFiles = AttachmentsService.visibleWhere(user, await this.access.teamIds(user.id));
    const current = await this.prisma.client.songVersion.findMany({
      where: { AND: [await this.access.songsVisibleTo(user), { id: { in: [...wanted] } }] },
      select: {
        id: true,
        updatedAt: true,
        attachments: { where: visibleFiles, select: { id: true, createdAt: true, stemPart: true, recordingKey: true, recordingTempo: true, recordingFirstBeat: true, visibility: true, visibleToTeamId: true } },
      },
    });
    const knownSongs = new Map((dto.knownSongs ?? []).map((song) => [song.id, song.version]));
    const songs: { id: string; version: string; audio: boolean; copy?: Awaited<ReturnType<OfflineService["songCopy"]>> }[] = [];
    for (const row of current) {
      const version = songVersion(row.updatedAt, row.attachments);
      const entry = { id: row.id, version, audio: audio.has(row.id) };
      songs.push(version === knownSongs.get(row.id) ? entry : { ...entry, copy: await this.songCopy(user, row.id) });
    }
    const goneSongs = [...knownSongs.keys()].filter((id) => !songs.some((song) => song.id === id));

    const viewer = await this.prisma.client.user.findUnique({ where: { id: user.id }, select: { chordNotation: true, capoDisplayMode: true } });
    return {
      days,
      upcoming,
      sets,
      gone,
      songbooks,
      goneSongbooks,
      songs,
      goneSongs,
      pins,
      viewer: { chordNotation: viewer?.chordNotation ?? "LETTERS", capoDisplayMode: viewer?.capoDisplayMode ?? "SOUNDING" },
    };
  }
}

/** A song's version: its last change and its files (a file added or removed, or its part, key or tempo changed, changes it too). */
function songVersion(
  updatedAt: Date | string,
  attachments: {
    id: string;
    createdAt: Date | string;
    stemPart: string | null;
    recordingKey: string | null;
    recordingTempo: number | null;
    recordingFirstBeat: number | null;
    visibility: string;
    visibleToTeamId: string | null;
  }[],
): string {
  const files = attachments
    .map(
      (file) =>
        `${file.id}@${new Date(file.createdAt).toISOString()}:${file.stemPart ?? ""}:${file.recordingKey ?? ""}:${file.recordingTempo ?? ""}:${file.recordingFirstBeat ?? ""}:${file.visibility}:${file.visibleToTeamId ?? ""}`,
    )
    .sort();
  return hash({ updatedAt: new Date(updatedAt).toISOString(), files });
}
