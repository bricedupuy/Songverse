import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Prisma } from "@songverse/db";
import { UnrecoverableError, type Job } from "bullmq";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JOB_WORKER_OPTIONS, RECORDINGS_QUEUE } from "../jobs/jobs.constants.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import { FfmpegMissingError, processTake } from "./ffmpeg.js";

export interface ProcessTakeJob {
  attachmentId: string;
  /** Shown in Admin > Background jobs. */
  filename: string;
  level: boolean;
  noise: boolean;
  /** RNNoise, for a voice (issue #132). */
  voice?: boolean;
  /** Its first beat (s): the count-in before it is the room's noise. */
  quietFor?: number | null;
}

/**
 * A recorded take, turned from the browser's WAV into Opus (issue #127) -
 * or any audio file cleaned up afterwards (issue #132):
 * about an eighth of the size, its trailing silence trimmed, its level
 * evened out and its noise reduced if asked. The result replaces the WAV
 * as a new file (a new id, so offline copies and caches fetch it again),
 * with everything else about it the same.
 */
@Processor(RECORDINGS_QUEUE, JOB_WORKER_OPTIONS)
export class RecordingsProcessor extends WorkerHost {
  private readonly logger = new Logger(RecordingsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<ProcessTakeJob>): Promise<{ attachmentId: string; bytes: number } | { skipped: string }> {
    const take = await this.prisma.client.attachment.findUnique({ where: { id: job.data.attachmentId } });
    if (!take || take.processing !== "PENDING") return { skipped: "gone or already done" };
    const dir = await mkdtemp(path.join(tmpdir(), "songverse-take-"));
    try {
      const opus = await processTake(await this.storage.get(take.storageKey), dir, { level: job.data.level, noise: job.data.noise, voice: job.data.voice, quietFor: job.data.quietFor });
      const { hash, sizeBytes } = await this.storage.put(opus, "audio/ogg");
      // Everything about it but its id and file, the same.
      const rest: Partial<typeof take> = { ...take };
      delete rest.id;
      const [processed] = await this.prisma.client.$transaction([
        this.prisma.client.attachment.create({
          data: { ...(rest as Omit<typeof take, "id">), cuePoints: take.cuePoints ?? Prisma.DbNull, filename: take.filename.replace(/\.[a-z0-9]{1,5}$/i, "") + ".opus", mimeType: "audio/ogg", storageKey: hash, sizeBytes, processing: null },
        }),
        this.prisma.client.attachment.delete({ where: { id: take.id } }),
      ]);
      await this.storage.deleteUnreferenced([take.storageKey]);
      this.logger.log(`Processed ${take.filename}: ${take.sizeBytes ?? 0} to ${sizeBytes} bytes`);
      return { attachmentId: processed.id, bytes: sizeBytes };
    } catch (error) {
      // Its last try (or no ffmpeg to try with): it stays as recorded, and says so.
      const missing = error instanceof FfmpegMissingError;
      if (missing || job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.prisma.client.attachment.updateMany({ where: { id: take.id, processing: "PENDING" }, data: { processing: "FAILED" } });
      }
      // Without ffmpeg, trying again won't help.
      throw missing ? new UnrecoverableError(error.message) : error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
