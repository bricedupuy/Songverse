import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { JobsOptions, Queue } from "bullmq";
import { createHash } from "node:crypto";
import { artistKey } from "../artists/artists.service";
import { LOOKUPS_QUEUE } from "../jobs/jobs.constants";

/** Kept for Admin > Metadata > Background jobs: the last hundred done, and failed. */
const KEEP: JobsOptions = { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } };

/** Puts lookups on the queue (issue #92); the Worker runs them (see LookupsProcessor). */
@Injectable()
export class LookupsService {
  private readonly logger = new Logger(LookupsService.name);

  constructor(@InjectQueue(LOOKUPS_QUEUE) private readonly queue: Queue) {}

  /** A new song's artwork. Never throws: the song is saved either way. */
  async songArtwork(songVersionId: string): Promise<void> {
    await this.queue.add("artwork", { songVersionId }, KEEP).catch((err: Error) => this.logger.warn(`Artwork lookup not queued: ${err.message}`));
  }

  /** Newly credited artists, one job each, once while it's waiting (the same artist added twice is one job). */
  async artists(names: string[]): Promise<void> {
    for (const name of names) {
      const key = artistKey(name);
      if (!key) continue;
      const jobId = `artist-${createHash("sha1").update(key).digest("hex")}`;
      await this.queue
        .add("artist", { name: name.trim() }, { jobId, removeOnComplete: true, removeOnFail: { count: 100 } })
        .catch((err: Error) => this.logger.warn(`Artist lookup not queued: ${err.message}`));
    }
  }

  /** A backfill, unless one is already waiting or running. */
  async backfill(name: "artwork-backfill" | "artist-backfill"): Promise<{ queued: boolean }> {
    const pending = await this.queue.getJobs(["waiting", "active", "delayed", "prioritized"]);
    if (pending.some((job) => job.name === name)) return { queued: false };
    await this.queue.add(name, {}, KEEP);
    return { queued: true };
  }
}
