import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type { StemSeparationParts } from "@songverse/core";
import type { Queue } from "bullmq";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AccessPolicyService, type Viewer } from "../access/access-policy.service.js";
import { AttachmentsService } from "../attachments/attachments.service.js";
import { STEM_SEPARATION_QUEUE } from "../jobs/jobs.constants.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { SubmitSeparationJob } from "./stem-separation.processor.js";
import { callbackSecret, getEffectiveStemSeparationSettings } from "./stem-separation-settings.js";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const JOB_OPTIONS = { attempts: 3, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: { count: 200 }, removeOnFail: { count: 200 } } as const;

/** Why a user can't split a song's recordings, if they can't. */
export type SeparationRefusal = "not-configured" | "not-granted";

/**
 * Splitting a song's recordings into stems (issue #63), from the API: who
 * may (global admins; a user an admin granted it to, on songs they can
 * edit; anyone in a granted team, on its songs), starting one - the Worker
 * sends it - listing them, trying again, and the Demucs API's webhooks.
 */
@Injectable()
export class StemSeparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
    private readonly attachments: AttachmentsService,
    @InjectQueue(STEM_SEPARATION_QUEUE) private readonly queue: Queue,
  ) {}

  /** Whether `viewer` may split this song's recordings, or why not. */
  async refusal(viewer: Viewer, songVersionId: string): Promise<SeparationRefusal | null> {
    const settings = await getEffectiveStemSeparationSettings();
    if (!settings.apiUrl || !settings.apiKey) return "not-configured";
    if (viewer.isGlobalAdmin) return null;
    const song = await this.prisma.client.songVersion.findUnique({ where: { id: songVersionId }, select: { id: true, ownerScope: true, ownerUserId: true, ownerTeamId: true } });
    if (!song) throw new NotFoundException("Song version not found");
    if (song.ownerScope === "TEAM" && song.ownerTeamId) {
      const team = await this.prisma.client.team.findUnique({ where: { id: song.ownerTeamId }, select: { canSeparateStems: true } });
      if (team?.canSeparateStems && (await this.access.teamRole(viewer.id, song.ownerTeamId))) return null;
    }
    const user = await this.prisma.client.user.findUnique({ where: { id: viewer.id }, select: { canSeparateStems: true } });
    if (user?.canSeparateStems && (await this.access.canEditContent(viewer, song))) return null;
    return "not-granted";
  }

  async list(viewer: Viewer, songVersionId: string) {
    await this.access.assertCanSeeSong(viewer, songVersionId);
    const refusal = await this.refusal(viewer, songVersionId);
    const rows = await this.prisma.client.stemSeparation.findMany({
      where: { songVersionId, ...(viewer.isGlobalAdmin || !refusal ? {} : { requestedByUserId: viewer.id }) },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { requestedBy: { select: { displayName: true } } },
    });
    return {
      available: !refusal,
      refusal,
      separations: rows.map((row) => ({
        id: row.id,
        sourceAttachmentId: row.sourceAttachmentId,
        parts: row.parts as StemSeparationParts,
        status: row.status,
        hqRequested: row.hqRequested,
        hqDone: row.hqDone,
        multitrackId: row.multitrackId,
        error: row.error,
        requestedBy: row.requestedBy?.displayName ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Starts one: checked here, sent by the Worker. `callbackUrl`, where the Demucs API's webhooks come (this API). */
  async start(viewer: Viewer, songVersionId: string, attachmentId: string, parts: StemSeparationParts, callbackUrl: string | null) {
    const refusal = await this.refusal(viewer, songVersionId);
    if (refusal === "not-configured") throw new BadRequestException("Stem separation isn't set up yet: an admin sets it up in Admin > Stem separation");
    if (refusal) throw new ForbiddenException("Splitting recordings into stems hasn't been granted to you here: an admin grants it");
    const source = await this.attachments.find(viewer, songVersionId, attachmentId);
    if (source.type !== "AUDIO") throw new BadRequestException("Only a recording can be split into stems");
    const settings = await getEffectiveStemSeparationSettings();
    if (settings.monthlyLimit !== null && !viewer.isGlobalAdmin) {
      const used = await this.prisma.client.stemSeparation.count({ where: { requestedByUserId: viewer.id, status: { not: "FAILED" }, createdAt: { gte: new Date(Date.now() - MONTH_MS) } } });
      if (used >= settings.monthlyLimit) throw new HttpException({ statusCode: 429, message: [`You've reached the limit of ${settings.monthlyLimit} separations in 30 days: try again later`] }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const running = await this.prisma.client.stemSeparation.count({ where: { sourceAttachmentId: attachmentId, status: { in: ["QUEUED", "SUBMITTED"] } } });
    if (running) throw new BadRequestException("This recording is already being split");
    // Made now, while there's a key to keep it with: the Worker signs nothing, it only passes it on.
    await callbackSecret();
    const separation = await this.prisma.client.stemSeparation.create({
      data: { songVersionId, sourceAttachmentId: attachmentId, requestedByUserId: viewer.id, parts, hqRequested: settings.hqEnabled },
    });
    await this.queue.add("submit", { separationId: separation.id, callbackUrl, filename: source.filename } satisfies SubmitSeparationJob, JOB_OPTIONS);
    return (await this.list(viewer, songVersionId)).separations.find((row) => row.id === separation.id)!;
  }

  /** A failed one, sent again (the same recording and parts). */
  async retry(viewer: Viewer, separationId: string, callbackUrl: string | null) {
    const separation = await this.prisma.client.stemSeparation.findUnique({ where: { id: separationId } });
    if (!separation || (separation.requestedByUserId !== viewer.id && !viewer.isGlobalAdmin)) throw new NotFoundException("Separation not found");
    if (separation.status !== "FAILED") throw new BadRequestException("Only a separation that failed can be tried again");
    await this.prisma.client.stemSeparation.update({ where: { id: separation.id }, data: { status: "QUEUED", error: null, jobId: null } });
    await this.queue.add("submit", { separationId: separation.id, callbackUrl } satisfies SubmitSeparationJob, JOB_OPTIONS);
  }

  /**
   * The Demucs API's webhook: its signature (HMAC-SHA256 of the raw body)
   * checked, then the Worker told to bring in what's ready. Anything
   * unsigned or unknown is refused - the webhook is only a nudge: the
   * Worker asks the API itself what the job has.
   */
  async callback(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    const secret = (await getEffectiveStemSeparationSettings()).callbackSecret;
    if (!secret || !rawBody || !signature) throw new ForbiddenException("Unsigned");
    const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new ForbiddenException("Bad signature");
    let jobId: string | undefined;
    try {
      jobId = (JSON.parse(rawBody.toString("utf8")) as { job_id?: string }).job_id;
    } catch {
      throw new BadRequestException("Not JSON");
    }
    if (!jobId) return;
    const separation = await this.prisma.client.stemSeparation.findUnique({ where: { jobId }, select: { id: true } });
    if (separation) await this.queue.add("sync", { separationId: separation.id }, { removeOnComplete: { count: 200 }, removeOnFail: { count: 200 }, attempts: 3, backoff: { type: "exponential", delay: 30000 } });
  }
}
