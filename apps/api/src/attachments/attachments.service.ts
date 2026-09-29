import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnsupportedMediaTypeException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { parseKey, type StemPart } from "@songverse/core";
import type { Prisma } from "@songverse/db";
import { AccessPolicyService, type Viewer } from "../access/access-policy.service.js";
import type { AttachmentVisibilityValue, UpdateAttachmentDto } from "./dto/upload-attachment.dto.js";
import { ImageService, type ProcessedImage } from "../images/image.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageQuotaService } from "../storage/storage-quota.service.js";
import { StorageService } from "../storage/storage.service.js";
import { RECORDINGS_QUEUE } from "../jobs/jobs.constants.js";
import type { ProcessTakeJob } from "../recordings/recordings.processor.js";
import type { AttachmentTypeValue } from "./dto/upload-attachment.dto.js";

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly quota: StorageQuotaService,
    private readonly images: ImageService,
    private readonly access: AccessPolicyService,
    @InjectQueue(RECORDINGS_QUEUE) private readonly recordings: Queue<ProcessTakeJob>,
  ) {}

  /**
   * The files `viewer` sees (issue #72): their own, the song's (SONG),
   * their teams' (TEAM), and those for the people the song is shared with
   * when it's shared with them (SHARED, #79); a global admin sees them all. Seeing the song
   * itself is checked separately.
   */
  static visibleWhere(viewer: Viewer, teamIds: string[]): Prisma.AttachmentWhereInput {
    if (viewer.isGlobalAdmin) return {};
    return {
      OR: [
        { visibility: "SONG" },
        { uploadedByUserId: viewer.id },
        { visibility: "TEAM", visibleToTeamId: { in: teamIds } },
        { visibility: "SHARED", songVersion: { accessGrants: { some: { grantedToUserId: viewer.id } } } },
      ],
    };
  }

  /** The song's files the viewer sees, newest first, with what they may do with each. */
  async listForSongVersion(viewer: Viewer, songVersionId: string) {
    const [teamIds, canEditSong] = await Promise.all([this.access.teamIds(viewer.id), this.canEditSong(viewer, songVersionId)]);
    const rows = await this.prisma.client.attachment.findMany({
      where: { songVersionId, ...AttachmentsService.visibleWhere(viewer, teamIds) },
      include: ATTACHMENT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => present(row, viewer, canEditSong));
  }

  /**
   * listForSongVersion for many songs at once (issue #122), in one query:
   * `canEditSong` says, for each song, whether the viewer manages it.
   */
  async listForSongVersions(viewer: Viewer, songs: { id: string; canEditSong: boolean }[]) {
    const teamIds = await this.access.teamIds(viewer.id);
    const rows = await this.prisma.client.attachment.findMany({
      where: { songVersionId: { in: songs.map((song) => song.id) }, ...AttachmentsService.visibleWhere(viewer, teamIds) },
      include: ATTACHMENT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    const bySong = new Map(songs.map((song) => [song.id, [] as ReturnType<typeof present>[]]));
    const canEdit = new Map(songs.map((song) => [song.id, song.canEditSong]));
    for (const row of rows) bySong.get(row.songVersionId)?.push(present(row, viewer, canEdit.get(row.songVersionId) ?? false));
    return bySong;
  }

  /**
   * A file on the song, for its uploader. Anyone who can see the song may
   * add their own (PRIVATE, or for a team of theirs); only who manages
   * the song may show one to everyone who sees it (SONG) or to the people
   * it's shared with (SHARED).
   */
  async upload(
    viewer: Viewer,
    songVersionId: string,
    type: AttachmentTypeValue,
    filename: string,
    mimeType: string,
    body: Buffer,
    stemPart: StemPart | null = null,
    visibility: AttachmentVisibilityValue = "PRIVATE",
    teamId: string | null = null,
    recording: RecordingChange = {},
    take: { process?: string; otherTake?: boolean; partName?: string } = {},
  ) {
    if (stemPart && type !== "AUDIO") throw new BadRequestException("Only audio files can be stems");
    const details = recordingData(recording);
    if (type !== "AUDIO" && (Object.values(details).some((value) => value !== null) || take.otherTake || take.process)) {
      throw new BadRequestException("Only audio files can have a recording's key and tempo or be part of a multitrack");
    }
    // A recorded take to turn into Opus (issue #127): the browser's WAV.
    const steps = take.process?.split(",") ?? [];
    if (take.process && !WAV_TYPES.has(mimeType)) throw new BadRequestException("Only a WAV file can be processed");
    if (details.multitrackSetlistId) await this.assertSetOfSong(viewer, details.multitrackSetlistId, songVersionId);
    const song = await this.songRights(viewer, songVersionId);
    const canEditSong = song.canEditSong;
    const audience = await this.audience(viewer, song, visibility, teamId);
    await this.quota.assertCanStore(viewer.id, body.length);
    const { hash, sizeBytes } = await this.storage.put(body, mimeType);
    const row = await this.prisma.client.attachment.create({
      data: {
        songVersionId,
        type,
        filename,
        mimeType,
        storageKey: hash,
        sizeBytes,
        uploadedByUserId: viewer.id,
        stemPart,
        ...details,
        ...audience,
        otherTake: take.otherTake ?? false,
        partName: type === "AUDIO" ? take.partName || null : null,
        processing: take.process ? "PENDING" : null,
      },
      include: ATTACHMENT_INCLUDE,
    });
    if (take.process) {
      await this.recordings.add(
        "process-take",
        { attachmentId: row.id, filename, voice: steps.includes("voice"), level: steps.includes("level"), noise: steps.includes("noise"), quietFor: row.recordingFirstBeat },
        { attempts: 2, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: { count: 200 }, removeOnFail: { count: 200 } },
      );
    }
    return present(row, viewer, canEditSong);
  }

  /**
   * Cleans up an audio file afterwards (issue #132): the Worker runs the
   * steps on it - RNNoise on a voice, the level evened out, steady noise
   * reduced - and it comes back as Opus, a new file in its place.
   */
  async process(viewer: Viewer, songVersionId: string, attachmentId: string, steps: ("voice" | "level" | "noise")[]) {
    const { attachment, canEditSong } = await this.findVisible(viewer, songVersionId, attachmentId);
    if (!present(attachment, viewer, canEditSong).canChange) throw new ForbiddenException("Only its uploader or the song's editors can change this file");
    if (attachment.type !== "AUDIO") throw new BadRequestException("Only audio files can be processed");
    if (attachment.processing === "PENDING") throw new BadRequestException("This file is already being processed");
    const row = await this.prisma.client.attachment.update({ where: { id: attachment.id }, data: { processing: "PENDING" }, include: ATTACHMENT_INCLUDE });
    await this.recordings.add(
      "process-take",
      { attachmentId: row.id, filename: row.filename, voice: steps.includes("voice"), level: steps.includes("level"), noise: steps.includes("noise"), quietFor: row.recordingFirstBeat },
      { attempts: 2, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: { count: 200 }, removeOnFail: { count: 200 } },
    );
    return present(row, viewer, canEditSong);
  }

  /** A set the viewer's (theirs, or their team's) with the song in it: what a multitrack can be recorded for (issue #127). */
  private async assertSetOfSong(viewer: Viewer, setlistId: string, songVersionId: string) {
    const set = await this.prisma.client.setlist.findFirst({
      where: { id: setlistId, items: { some: { songVersionId } } },
      select: { ownerUserId: true, ownerTeamId: true },
    });
    const mine =
      !!set && (viewer.isGlobalAdmin || set.ownerUserId === viewer.id || (!!set.ownerTeamId && (await this.access.teamRole(viewer.id, set.ownerTeamId)) !== null));
    if (!mine) throw new BadRequestException("multitrackSetlistId must be a set of yours with this song in it");
  }

  /**
   * Plays this take of its part (issue #127) - instead of `instead`, which
   * becomes another take, when given. Both in the same multitrack, and the
   * viewer's to change.
   */
  async useTake(viewer: Viewer, songVersionId: string, attachmentId: string, instead: string | null) {
    const { attachment, canEditSong } = await this.findVisible(viewer, songVersionId, attachmentId);
    if (!present(attachment, viewer, canEditSong).canChange) throw new ForbiddenException("Only its uploader or the song's editors can change this file");
    const replaced = instead ? await this.findVisible(viewer, songVersionId, instead) : null;
    if (replaced) {
      if (!present(replaced.attachment, viewer, canEditSong).canChange) throw new ForbiddenException("Only its uploader or the song's editors can change the take it replaces");
      if (replaced.attachment.id === attachment.id || (replaced.attachment.multitrackId ?? null) !== (attachment.multitrackId ?? null) || replaced.attachment.type !== "AUDIO") {
        throw new BadRequestException("instead must be another file of the same multitrack");
      }
    }
    await this.prisma.client.$transaction([
      this.prisma.client.attachment.update({ where: { id: attachment.id }, data: { otherTake: false } }),
      ...(replaced ? [this.prisma.client.attachment.update({ where: { id: replaced.attachment.id }, data: { otherTake: true } })] : []),
    ]);
    return this.listForSongVersion(viewer, songVersionId);
  }

  /**
   * An audio file's part of the song (a stem, #64), its recording's key
   * and tempo (#65) - for its uploader or who can edit the song - and who
   * sees it (#72), for its uploader. What's left out stays; null clears.
   */
  async update(viewer: Viewer, songVersionId: string, attachmentId: string, change: UpdateAttachmentDto) {
    const { attachment, canEditSong } = await this.findVisible(viewer, songVersionId, attachmentId);
    const rights = present(attachment, viewer, canEditSong);
    const data: Prisma.AttachmentUncheckedUpdateInput = recordingData(change);
    if (change.stemPart !== undefined) data.stemPart = change.stemPart;
    if (change.partName !== undefined) data.partName = change.partName;
    if (change.multitrackSetlistId) await this.assertSetOfSong(viewer, change.multitrackSetlistId, songVersionId);
    if (change.otherTake !== undefined) {
      if (attachment.type !== "AUDIO") throw new BadRequestException("Only audio files can be takes");
      data.otherTake = change.otherTake;
    }
    if (attachment.type !== "AUDIO" && Object.values(data).some((value) => value !== null)) {
      throw new BadRequestException("Only audio files can be stems or have a recording's key and tempo");
    }
    if (Object.keys(data).length > 0 && !rights.canChange) throw new ForbiddenException("Only its uploader or the song's editors can change this file");
    if (change.visibility !== undefined) {
      if (!rights.canChangeVisibility) throw new ForbiddenException("Only its uploader decides who sees this file");
      Object.assign(data, await this.audience(viewer, await this.songRights(viewer, songVersionId), change.visibility, change.teamId ?? null));
    }
    const row = await this.prisma.client.attachment.update({ where: { id: attachment.id }, data, include: ATTACHMENT_INCLUDE });
    return present(row, viewer, canEditSong);
  }

  /** One of the song's files the viewer sees, or 404. */
  async find(viewer: Viewer, songVersionId: string, attachmentId: string) {
    return (await this.findVisible(viewer, songVersionId, attachmentId)).attachment;
  }

  /** A resized WebP rendition of an image attachment (see ImageService.resize for sizing rules). */
  async resizedImage(viewer: Viewer, songVersionId: string, attachmentId: string, width: number): Promise<ProcessedImage> {
    const attachment = await this.find(viewer, songVersionId, attachmentId);
    if (attachment.type !== "IMAGE" && !attachment.mimeType.startsWith("image/")) {
      throw new UnsupportedMediaTypeException("This attachment isn't an image");
    }
    return this.images.resize(attachment.storageKey, () => this.storage.get(attachment.storageKey), width);
  }

  /**
   * Deletes the Attachment row, then deletes the underlying object only if
   * no other Attachment (in this or any other song version) or avatar still
   * references the same content hash - see docs/songbooks-and-catalog.md
   * §8. Checked on demand rather than via a maintained counter, which
   * could drift out of sync with the actual row count.
   */
  async remove(viewer: Viewer, songVersionId: string, attachmentId: string): Promise<void> {
    const { attachment, canEditSong } = await this.findVisible(viewer, songVersionId, attachmentId);
    if (!present(attachment, viewer, canEditSong).canChange) throw new ForbiddenException("Only its uploader or the song's editors can remove this file");
    await this.prisma.client.attachment.delete({ where: { id: attachment.id } });
    await this.storage.deleteUnreferenced([attachment.storageKey]);
  }

  private async canEditSong(viewer: Viewer, songVersionId: string): Promise<boolean> {
    return (await this.songRights(viewer, songVersionId)).canEditSong;
  }

  private async songRights(viewer: Viewer, songVersionId: string) {
    const song = await this.prisma.client.songVersion.findUnique({
      where: { id: songVersionId },
      select: { ownerScope: true, ownerUserId: true, ownerTeamId: true },
    });
    if (!song) throw new NotFoundException("Song version not found");
    return { canEditSong: await this.access.canEdit(viewer, song), isGlobal: song.ownerScope === "GLOBAL" };
  }

  /** Checks who a file may be shown to, as the columns that say so. */
  private async audience(
    viewer: Viewer,
    { canEditSong, isGlobal }: { canEditSong: boolean; isGlobal: boolean },
    visibility: AttachmentVisibilityValue,
    teamId: string | null,
  ): Promise<{ visibility: AttachmentVisibilityValue; visibleToTeamId: string | null }> {
    if (visibility === "SONG" && !canEditSong) throw new ForbiddenException("Only who can edit the song can show a file to everyone who sees it");
    if (visibility === "SHARED") {
      if (!canEditSong) throw new ForbiddenException("Only who shares the song can show a file to the people it's shared with");
      if (isGlobal) throw new BadRequestException("A catalogue song isn't shared with anyone: everyone sees it");
    }
    if (visibility !== "TEAM") return { visibility, visibleToTeamId: null };
    if (!teamId) throw new BadRequestException("Choose the team that sees it");
    if (!viewer.isGlobalAdmin && !(await this.access.teamRole(viewer.id, teamId))) throw new ForbiddenException("Not a member of that team");
    return { visibility, visibleToTeamId: teamId };
  }

  /** A file of the song the viewer sees (404 otherwise, not telling hidden from missing). */
  private async findVisible(viewer: Viewer, songVersionId: string, attachmentId: string) {
    const [teamIds, canEditSong] = await Promise.all([this.access.teamIds(viewer.id), this.canEditSong(viewer, songVersionId)]);
    const attachment = await this.prisma.client.attachment.findFirst({
      where: { id: attachmentId, songVersionId, ...AttachmentsService.visibleWhere(viewer, teamIds) },
      include: ATTACHMENT_INCLUDE,
    });
    if (!attachment) throw new NotFoundException("Attachment not found");
    return { attachment, canEditSong };
  }
}

const ATTACHMENT_INCLUDE = {
  uploadedBy: { select: { id: true, displayName: true } },
  visibleToTeam: { select: { id: true, name: true } },
  multitrackSetlist: { select: { id: true, name: true, eventDate: true } },
} satisfies Prisma.AttachmentInclude;

type AttachmentRow = Prisma.AttachmentGetPayload<{ include: typeof ATTACHMENT_INCLUDE }>;

/**
 * A file as the viewer gets it: `canChange` (its part, key and tempo, or
 * removing it) for its uploader and who can edit the song;
 * `canChangeVisibility` for its uploader (or, for a file whose uploader
 * isn't known, the song's editors).
 */
/** An audio file's recording details (#65, #100) and multitrack (#123): what's left out stays, null clears. */
export interface RecordingChange {
  recordingKey?: string | null;
  recordingTempo?: number | null;
  recordingFirstBeat?: number | null;
  recordingTimeSignature?: string | null;
  pitchOffset?: number | null;
  multitrackId?: string | null;
  multitrackName?: string | null;
  multitrackSetlistId?: string | null;
}

const WAV_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"]);

function recordingData(change: RecordingChange) {
  const data: RecordingChange = {};
  if (change.recordingKey !== undefined) {
    // Kept as written ("Gb" stays "Gb"), once it reads as a key.
    const written = change.recordingKey?.trim() ?? "";
    if (written && !parseKey(written)) throw new BadRequestException(`"${written}" isn't a key Songverse can read`);
    data.recordingKey = written || null;
  }
  for (const field of ["recordingTempo", "recordingFirstBeat", "recordingTimeSignature", "pitchOffset", "multitrackId", "multitrackName", "multitrackSetlistId"] as const) {
    if (change[field] !== undefined) (data as Record<string, unknown>)[field] = change[field];
  }
  return data;
}

function present(row: AttachmentRow, viewer: Viewer, canEditSong: boolean) {
  const mine = row.uploadedByUserId === viewer.id;
  const set = row.multitrackSetlist;
  return {
    ...row,
    // The set its multitrack was recorded for (issue #127), named as sets are: its date a calendar day.
    multitrackSetlist: set ? { id: set.id, name: set.name, eventDate: set.eventDate ? set.eventDate.toISOString().slice(0, 10) : null } : null,
    mine,
    canChange: viewer.isGlobalAdmin || canEditSong || mine,
    canChangeVisibility: viewer.isGlobalAdmin || mine || (row.uploadedByUserId === null && canEditSong),
  };
}
