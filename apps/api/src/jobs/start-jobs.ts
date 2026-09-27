import type { INestApplicationContext } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import type { WorkerHost } from "@nestjs/bullmq";
import { hostname } from "node:os";
import { BulkUploadProcessor } from "../bulk-upload/bulk-upload.processor";
import { LookupsProcessor } from "../lookups/lookups.processor";
import { TransferExpiryProcessor } from "../user-management/transfer-expiry.processor";
import { HEARTBEAT_KEY } from "./jobs.constants";
import { redis } from "./redis";

/** Every job processor: a new one needs adding here, or no process runs its jobs. */
const PROCESSORS = [BulkUploadProcessor, TransferExpiryProcessor, LookupsProcessor];

const logger = new Logger("Jobs");

/**
 * Starts running jobs in this process (issue #92) - the Worker's, or the
 * API's with JOBS_IN_API - and says so in Redis every 15 seconds, for
 * Admin > Metadata > Background jobs. Returns a stop for the heartbeat.
 */
export function startJobs(app: INestApplicationContext, role: "worker" | "api"): () => void {
  const queues: string[] = [];
  for (const processor of PROCESSORS) {
    const host = app.get<WorkerHost>(processor, { strict: false });
    queues.push(host.worker.name);
    host.worker.run().catch((err: unknown) => logger.error(`${processor.name} stopped: ${err instanceof Error ? err.message : String(err)}`));
  }
  const beat = () =>
    redis()
      .set(HEARTBEAT_KEY(role), JSON.stringify({ at: new Date().toISOString(), host: hostname(), pid: process.pid }), "EX", 60)
      .catch(() => undefined);
  void beat();
  const timer = setInterval(beat, 15000);
  // Named, so a deploy's logs show which queues this process runs.
  logger.log(`Running background jobs in the ${role}: ${queues.join(", ")}`);
  return () => clearInterval(timer);
}
