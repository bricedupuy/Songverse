import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { ArtistsService } from "../artists/artists.service";
import { ArtworkService } from "../artwork/artwork.service";
import { JOB_WORKER_OPTIONS, LOOKUPS_QUEUE } from "../jobs/jobs.constants";

export type LookupJob =
  | { name: "artwork"; data: { songVersionId: string } }
  | { name: "artist"; data: { name: string } }
  | { name: "artwork-backfill"; data: Record<string, never> }
  | { name: "artist-backfill"; data: Record<string, never> };

/**
 * The lookups queue (issue #92): a new song's artwork, a new artist's
 * picture and bio, and the admin's backfills - one at a time, as the
 * providers limit how fast they're asked.
 */
@Processor(LOOKUPS_QUEUE, { ...JOB_WORKER_OPTIONS, concurrency: 1 })
export class LookupsProcessor extends WorkerHost {
  private readonly logger = new Logger(LookupsProcessor.name);

  constructor(
    private readonly artwork: ArtworkService,
    private readonly artists: ArtistsService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name as LookupJob["name"]) {
      case "artwork":
        return { found: await this.artwork.autoFind((job.data as { songVersionId: string }).songVersionId) };
      case "artist":
        return this.artists.lookUpNamed((job.data as { name: string }).name);
      case "artwork-backfill":
        return this.artwork.backfill();
      case "artist-backfill":
        return this.artists.backfill();
      default:
        this.logger.warn(`Unknown lookup job ${job.name}`);
        return null;
    }
  }
}
