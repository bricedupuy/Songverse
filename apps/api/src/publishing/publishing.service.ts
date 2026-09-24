import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { readSongDocument } from "@songverse/core";
import type { Prisma } from "@songverse/db";
import { AccessPolicyService, OPEN_SUBMISSION_STATES } from "../access/access-policy.service";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { PrismaService } from "../prisma/prisma.service";

type Tx = Prisma.TransactionClient;
type SubmissionState = "SUBMITTED" | "UNDER_REVIEW" | "NEEDS_CHANGES" | "APPROVED" | "REJECTED" | "WITHDRAWN";

/** A global song that looks like the one being published. */
export interface CatalogueMatch {
  id: string;
  title: string;
  versionName: string | null;
  language: string;
  artists: string[];
  /** Why it matched: same title and an artist in common, same title only, or the same CCLI number. */
  reason: "titleAndArtist" | "title" | "ccli";
}

const SONG_SUMMARY = {
  id: true,
  title: true,
  versionName: true,
  language: true,
  ownerScope: true,
  ownerUserId: true,
  ownerTeamId: true,
  ownerTeam: { select: { name: true } },
  contributors: { where: { roles: { has: "PERFORMER" } }, select: { source: true }, orderBy: { displayOrder: "asc" } },
} satisfies Prisma.SongVersionSelect;

const SUBMISSION_SELECT = {
  id: true,
  state: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
  submitterMessage: true,
  duplicateReason: true,
  reviewNotes: true,
  similarityResults: true,
  mergeTargetId: true,
  publishedVersionId: true,
  submitter: { select: { id: true, displayName: true, email: true } },
  reviewer: { select: { id: true, displayName: true } },
  songVersion: { select: SONG_SUMMARY },
  publishedVersion: { select: { id: true, title: true } },
} satisfies Prisma.SubmissionSelect;

type SubmissionRow = Prisma.SubmissionGetPayload<{ select: typeof SUBMISSION_SELECT }>;

function toSubmission({ songVersion, similarityResults, ...rest }: SubmissionRow) {
  const { contributors, ownerTeam, ...song } = songVersion;
  return {
    ...rest,
    matches: (similarityResults ?? []) as unknown as CatalogueMatch[],
    song: { ...song, teamName: ownerTeam?.name ?? null, artists: contributors.map((c) => c.source ?? "") },
  };
}

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");

/**
 * Putting personal and team songs into the global catalogue.
 *
 * Anyone who can edit a song can submit it; reviewers (and global admins)
 * approve it, send it back for changes, reject it, or merge it into a
 * global song it duplicates. Approving copies the song into the catalogue
 * and links the original to the copy (an UpstreamLink), so the submitter
 * keeps their own song to change as they like. Global admins can also
 * publish a song straight away - only when they choose to, never
 * automatically. Copyright and CCLI details aren't required.
 */
@Injectable()
export class PublishingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  /** What the song page shows: the latest submission, the global song it's linked to, and look-alikes. */
  async status(user: AuthenticatedUser, songVersionId: string) {
    const song = await this.editableSong(user, songVersionId);
    const [latest, link, matches] = await Promise.all([
      this.prisma.client.submission.findFirst({
        where: { songVersionId },
        orderBy: { createdAt: "desc" },
        select: SUBMISSION_SELECT,
      }),
      this.prisma.client.upstreamLink.findFirst({
        where: { localVersionId: songVersionId },
        select: { globalVersion: { select: { id: true, title: true } } },
      }),
      song.ownerScope === "GLOBAL" ? Promise.resolve([]) : this.findMatches(songVersionId),
    ]);
    return {
      submission: latest ? toSubmission(latest) : null,
      published: link?.globalVersion ?? null,
      matches,
      canSubmit: song.ownerScope !== "GLOBAL" && !link && !(latest && isOpen(latest.state)),
      canPublishDirectly: user.isGlobalAdmin && song.ownerScope !== "GLOBAL" && !link && !(latest && isOpen(latest.state)),
    };
  }

  async submit(user: AuthenticatedUser, songVersionId: string, input: { message?: string; duplicateReason?: string }) {
    const matches = await this.assertPublishable(user, songVersionId, input.duplicateReason);
    const submission = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.submission.create({
        data: {
          songVersionId,
          submitterId: user.id,
          submitterMessage: input.message?.trim() || null,
          duplicateReason: matches.length ? input.duplicateReason!.trim() : null,
          similarityResults: matches as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await tx.songVersion.update({ where: { id: songVersionId }, data: { publicationState: "SUBMITTED" } });
      await audit(tx, "SUBMITTED", created.id, user.id, songVersionId);
      return created;
    });
    return this.findOneRow(submission.id);
  }

  /** A global admin puts their song in the catalogue without a review. */
  async publishDirectly(user: AuthenticatedUser, songVersionId: string, input: { duplicateReason?: string; trustLabel?: string }) {
    if (!user.isGlobalAdmin) throw new ForbiddenException("Only global admins can publish without a review");
    const matches = await this.assertPublishable(user, songVersionId, input.duplicateReason);
    const id = await this.prisma.client.$transaction(async (tx) => {
      const { id } = await tx.submission.create({
        data: {
          songVersionId,
          submitterId: user.id,
          reviewerId: user.id,
          duplicateReason: matches.length ? input.duplicateReason!.trim() : null,
          similarityResults: matches as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await this.approveIn(tx, user, id, songVersionId, { trustLabel: input.trustLabel });
      return id;
    });
    return this.findOneRow(id);
  }

  /** The submitter (or anyone who can edit the song) takes it back. */
  async withdraw(user: AuthenticatedUser, submissionId: string) {
    const submission = await this.ownSubmission(user, submissionId);
    if (!isOpen(submission.state)) throw new ConflictException("This submission is no longer open");
    await this.prisma.client.$transaction(async (tx) => {
      await tx.submission.update({ where: { id: submissionId }, data: { state: "WITHDRAWN" } });
      await tx.songVersion.update({ where: { id: submission.songVersionId }, data: { publicationState: "DRAFT" } });
      await audit(tx, "WITHDRAWN", submissionId, user.id, submission.songVersionId);
    });
    return this.findOneRow(submissionId);
  }

  /** Sends a song back for review after the changes a reviewer asked for. */
  async resubmit(user: AuthenticatedUser, submissionId: string, input: { message?: string }) {
    const submission = await this.ownSubmission(user, submissionId);
    if (submission.state !== "NEEDS_CHANGES") throw new ConflictException("Only a submission sent back for changes can be resubmitted");
    const matches = await this.findMatches(submission.songVersionId);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: submissionId },
        data: {
          state: "SUBMITTED",
          ...(input.message?.trim() && { submitterMessage: input.message.trim() }),
          similarityResults: matches as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.songVersion.update({ where: { id: submission.songVersionId }, data: { publicationState: "SUBMITTED" } });
      await audit(tx, "SUBMITTED", submissionId, user.id, submission.songVersionId, { resubmitted: true });
    });
    return this.findOneRow(submissionId);
  }

  /** The review queue: open submissions, oldest first (or closed ones, newest first). */
  async list(user: AuthenticatedUser, filter: "open" | "closed") {
    assertReviewer(user);
    const rows = await this.prisma.client.submission.findMany({
      where: filter === "open" ? { state: { in: [...OPEN_SUBMISSION_STATES] } } : { state: { notIn: [...OPEN_SUBMISSION_STATES] } },
      orderBy: { createdAt: filter === "open" ? "asc" : "desc" },
      take: filter === "open" ? undefined : 100,
      select: SUBMISSION_SELECT,
    });
    return rows.map(toSubmission);
  }

  /** The user's own submissions, newest first. */
  async mine(user: AuthenticatedUser) {
    const rows = await this.prisma.client.submission.findMany({
      where: { submitterId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: SUBMISSION_SELECT,
    });
    return rows.map(toSubmission);
  }

  async findOne(user: AuthenticatedUser, submissionId: string) {
    const row = await this.findOneRow(submissionId);
    if (!isReviewer(user) && row.submitter.id !== user.id) {
      await this.editableSong(user, row.song.id);
    }
    return row;
  }

  async startReview(user: AuthenticatedUser, submissionId: string) {
    const submission = await this.reviewable(user, submissionId, ["SUBMITTED"]);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.submission.update({ where: { id: submissionId }, data: { state: "UNDER_REVIEW", reviewerId: user.id } });
      await tx.songVersion.update({ where: { id: submission.songVersionId }, data: { publicationState: "UNDER_REVIEW" } });
    });
    return this.findOneRow(submissionId);
  }

  async approve(user: AuthenticatedUser, submissionId: string, input: { notes?: string; trustLabel?: string }) {
    const submission = await this.reviewable(user, submissionId, ["SUBMITTED", "UNDER_REVIEW"]);
    await this.assertNotPublished(submission.songVersionId);
    await this.prisma.client.$transaction((tx) =>
      this.approveIn(tx, user, submissionId, submission.songVersionId, { notes: input.notes, trustLabel: input.trustLabel }),
    );
    return this.findOneRow(submissionId);
  }

  /** The song is already in the catalogue: link the submitter's song to that one instead of copying it. */
  async merge(user: AuthenticatedUser, submissionId: string, input: { targetId: string; notes?: string }) {
    const submission = await this.reviewable(user, submissionId, ["SUBMITTED", "UNDER_REVIEW"]);
    await this.assertNotPublished(submission.songVersionId);
    const target = await this.prisma.client.songVersion.findUnique({
      where: { id: input.targetId },
      select: { ownerScope: true, publicationState: true },
    });
    if (!target || target.ownerScope !== "GLOBAL" || target.publicationState !== "APPROVED") {
      throw new BadRequestException("Merge into a song that's in the global catalogue");
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: submissionId },
        data: {
          state: "APPROVED",
          reviewerId: user.id,
          reviewedAt: new Date(),
          reviewNotes: input.notes?.trim() || null,
          mergeTargetId: input.targetId,
          publishedVersionId: input.targetId,
        },
      });
      await tx.upstreamLink.create({ data: { localVersionId: submission.songVersionId, globalVersionId: input.targetId, lastSyncedAt: new Date() } });
      await tx.songVersion.update({ where: { id: submission.songVersionId }, data: { publicationState: "APPROVED" } });
      await audit(tx, "APPROVED", submissionId, user.id, submission.songVersionId, { mergedInto: input.targetId });
    });
    return this.findOneRow(submissionId);
  }

  async requestChanges(user: AuthenticatedUser, submissionId: string, notes: string) {
    return this.close(user, submissionId, "NEEDS_CHANGES", notes);
  }

  async reject(user: AuthenticatedUser, submissionId: string, notes: string) {
    return this.close(user, submissionId, "REJECTED", notes);
  }

  private async close(user: AuthenticatedUser, submissionId: string, state: "NEEDS_CHANGES" | "REJECTED", notes: string) {
    if (!notes.trim()) throw new BadRequestException("Say what needs changing, or why it's rejected");
    const submission = await this.reviewable(user, submissionId, ["SUBMITTED", "UNDER_REVIEW"]);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: submissionId },
        data: { state, reviewerId: user.id, reviewedAt: new Date(), reviewNotes: notes.trim() },
      });
      await tx.songVersion.update({ where: { id: submission.songVersionId }, data: { publicationState: state } });
      await audit(tx, state === "REJECTED" ? "REJECTED" : "UPDATED", submissionId, user.id, submission.songVersionId, { state });
    });
    return this.findOneRow(submissionId);
  }

  /** Copies the song into the catalogue, links the original to the copy and closes the submission. */
  private async approveIn(tx: Tx, user: AuthenticatedUser, submissionId: string, songVersionId: string, input: { notes?: string; trustLabel?: string }) {
    const copyId = await copyToGlobal(tx, songVersionId, input.trustLabel?.trim() || null);
    await tx.upstreamLink.create({ data: { localVersionId: songVersionId, globalVersionId: copyId, lastSyncedAt: new Date() } });
    await tx.submission.update({
      where: { id: submissionId },
      data: {
        state: "APPROVED",
        reviewerId: user.id,
        reviewedAt: new Date(),
        reviewNotes: input.notes?.trim() || null,
        publishedVersionId: copyId,
      },
    });
    await tx.songVersion.update({ where: { id: songVersionId }, data: { publicationState: "APPROVED" } });
    await audit(tx, "APPROVED", submissionId, user.id, songVersionId);
    await tx.auditEvent.create({
      data: { action: "PROMOTED_TO_GLOBAL", entityType: "SongVersion", entityId: copyId, actorUserId: user.id, songVersionId: copyId, metadata: { from: songVersionId, submissionId } },
    });
  }

  /**
   * Global songs that look like this one: the same title or subtitle
   * (ignoring case and accents), or the same CCLI number.
   */
  async findMatches(songVersionId: string): Promise<CatalogueMatch[]> {
    const song = await this.prisma.client.songVersion.findUniqueOrThrow({
      where: { id: songVersionId },
      select: { title: true, alternateTitle: true, ccli: true, contributors: { where: { roles: { has: "PERFORMER" } }, select: { source: true } } },
    });
    const titles = [song.title, song.alternateTitle].filter((t): t is string => !!t?.trim());
    const candidates = await this.prisma.client.songVersion.findMany({
      where: {
        ownerScope: "GLOBAL",
        publicationState: "APPROVED",
        OR: [
          ...titles.flatMap((t) => [
            { title: { equals: t.trim(), mode: "insensitive" as const } },
            { alternateTitle: { equals: t.trim(), mode: "insensitive" as const } },
          ]),
          ...(song.ccli ? [{ ccli: song.ccli }] : []),
        ],
      },
      select: { ...SONG_SUMMARY, ccli: true },
      take: 20,
    });
    const artists = new Set(song.contributors.map((c) => fold(c.source ?? "")).filter(Boolean));
    return candidates.map((c) => {
      const theirArtists = c.contributors.map((a) => a.source ?? "");
      const sameCcli = !!song.ccli && c.ccli === song.ccli;
      const sharedArtist = theirArtists.some((a) => artists.has(fold(a)));
      return {
        id: c.id,
        title: c.title,
        versionName: c.versionName,
        language: c.language,
        artists: theirArtists,
        reason: sameCcli ? "ccli" : sharedArtist ? "titleAndArtist" : "title",
      } satisfies CatalogueMatch;
    });
  }

  /** The look-alikes, after checking the song can be put forward at all. */
  private async assertPublishable(user: AuthenticatedUser, songVersionId: string, duplicateReason: string | undefined) {
    const song = await this.editableSong(user, songVersionId);
    if (song.ownerScope === "GLOBAL") throw new BadRequestException("This song is already in the global catalogue");
    await this.assertNotPublished(songVersionId);
    const open = await this.prisma.client.submission.count({ where: { songVersionId, state: { in: [...OPEN_SUBMISSION_STATES] } } });
    if (open > 0) throw new ConflictException("This song is already waiting for review");
    const matches = await this.findMatches(songVersionId);
    if (matches.length > 0 && !duplicateReason?.trim()) {
      throw new ConflictException({
        message: "Similar songs are already in the global catalogue - say why this one should be added too",
        matches,
      });
    }
    return matches;
  }

  private async assertNotPublished(songVersionId: string) {
    const link = await this.prisma.client.upstreamLink.count({ where: { localVersionId: songVersionId } });
    if (link > 0) throw new ConflictException("This song is already in the global catalogue");
  }

  private async editableSong(user: AuthenticatedUser, songVersionId: string) {
    const song = await this.prisma.client.songVersion.findUnique({
      where: { id: songVersionId },
      select: { ownerScope: true, ownerUserId: true, ownerTeamId: true },
    });
    if (!song) throw new NotFoundException("Song version not found");
    await this.access.assertCanEdit(user, song, "song");
    return song;
  }

  /** A submission the user sent, or one for a song they can edit. */
  private async ownSubmission(user: AuthenticatedUser, submissionId: string) {
    const submission = await this.prisma.client.submission.findUnique({
      where: { id: submissionId },
      select: { state: true, songVersionId: true, submitterId: true },
    });
    if (!submission) throw new NotFoundException("Submission not found");
    if (submission.submitterId !== user.id) await this.editableSong(user, submission.songVersionId);
    return submission;
  }

  /** A submission in one of `states` that `user` may review (not their own, unless they're a global admin). */
  private async reviewable(user: AuthenticatedUser, submissionId: string, states: SubmissionState[]) {
    assertReviewer(user);
    const submission = await this.prisma.client.submission.findUnique({
      where: { id: submissionId },
      select: { state: true, songVersionId: true, submitterId: true },
    });
    if (!submission) throw new NotFoundException("Submission not found");
    if (submission.submitterId === user.id && !user.isGlobalAdmin) {
      throw new ForbiddenException("Someone else has to review your own submission");
    }
    if (!states.includes(submission.state)) throw new ConflictException(`This submission is ${submission.state.toLowerCase().replace("_", " ")}`);
    return submission;
  }

  private async findOneRow(submissionId: string) {
    const row = await this.prisma.client.submission.findUnique({ where: { id: submissionId }, select: SUBMISSION_SELECT });
    if (!row) throw new NotFoundException("Submission not found");
    return toSubmission(row);
  }
}

function isOpen(state: string): boolean {
  return (OPEN_SUBMISSION_STATES as readonly string[]).includes(state);
}

function isReviewer(user: AuthenticatedUser): boolean {
  return user.isGlobalAdmin || user.isReviewer;
}

function assertReviewer(user: AuthenticatedUser): void {
  if (!isReviewer(user)) throw new ForbiddenException("Reviewer role required");
}

function audit(
  tx: Tx,
  action: "SUBMITTED" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "UPDATED",
  submissionId: string,
  actorUserId: string,
  songVersionId: string,
  metadata?: Prisma.InputJsonObject,
) {
  return tx.auditEvent.create({
    data: { action, entityType: "Submission", entityId: submissionId, actorUserId, songVersionId, ...(metadata && { metadata }) },
  });
}

/**
 * A global, approved copy of the song in a Work of its own: its fields,
 * chart, credits, links and global tags. Personal notes, the user's own
 * tags and files stay with the original.
 */
async function copyToGlobal(tx: Tx, sourceId: string, trustLabel: string | null): Promise<string> {
  const source = await tx.songVersion.findUniqueOrThrow({
    where: { id: sourceId },
    select: {
      title: true,
      alternateTitle: true,
      versionName: true,
      sortTitle: true,
      language: true,
      copyright: true,
      copyrightYear: true,
      publisher: true,
      album: true,
      year: true,
      isrc: true,
      reference: true,
      ccli: true,
      capo: true,
      documentJson: true,
      contributors: { select: { userId: true, source: true, roles: true, displayOrder: true } },
      versionTags: { where: { tag: { scope: "GLOBAL", isApproved: true } }, select: { tagId: true } },
      identifiers: { select: { type: true, value: true, sourceUrl: true, verifiedAt: true, note: true, details: true } },
    },
  });
  const { contributors, versionTags, identifiers, documentJson, ...fields } = source;
  const work = await tx.work.create({ data: {} });
  const copy = await tx.songVersion.create({
    data: {
      ...fields,
      // A new song: its own revision history starts again.
      documentJson: { ...readSongDocument(documentJson), revision: 1 } as Prisma.InputJsonValue,
      trustLabel,
      workId: work.id,
      ownerScope: "GLOBAL",
      publicationState: "APPROVED",
    },
    select: { id: true },
  });
  await tx.work.update({ where: { id: work.id }, data: { preferredOriginalVersionId: copy.id } });
  if (contributors.length) {
    await tx.versionContributor.createMany({ data: contributors.map((c) => ({ ...c, songVersionId: copy.id })) });
  }
  if (versionTags.length) {
    await tx.songVersionTag.createMany({ data: versionTags.map((t) => ({ tagId: t.tagId, songVersionId: copy.id })) });
  }
  if (identifiers.length) {
    await tx.songVersionIdentifier.createMany({
      data: identifiers.map(({ details, ...i }) => ({ ...i, songVersionId: copy.id, ...(details !== null && { details: details as Prisma.InputJsonValue }) })),
    });
  }
  return copy.id;
}
