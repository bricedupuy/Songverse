import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { BULK_UPLOAD_QUEUE } from "../bulk-upload/bulk-upload.types";
import { USER_MAINTENANCE_QUEUE } from "../user-management/transfer-expiry.processor";
import { HEARTBEAT_KEY, jobsInApi, LOOKUPS_QUEUE } from "./jobs.constants";
import { redis } from "./redis";

interface Beat {
  at: string;
  host: string;
}

export interface JobsStatus {
  /** The Worker's last heartbeat (every 15 seconds; gone after a minute), or null. */
  worker: Beat | null;
  /** An API process that runs jobs itself (JOBS_IN_API), or null. */
  api: Beat | null;
  /** Whether the API answering this runs jobs. */
  thisApiRunsJobs: boolean;
  queues: { name: string; waiting: number; active: number; delayed: number; failed: number; completed: number }[];
  /** The last jobs done or failed, newest first. */
  recent: { queue: string; name: string; state: "completed" | "failed"; finishedAt: string | null; result: unknown; error: string | null; subject: string | null }[];
}

/** Background jobs' state, for Admin > Metadata (issue #92). */
@Injectable()
export class JobsService {
  constructor(
    @InjectQueue(LOOKUPS_QUEUE) private readonly lookups: Queue,
    @InjectQueue(BULK_UPLOAD_QUEUE) private readonly bulkUpload: Queue,
    @InjectQueue(USER_MAINTENANCE_QUEUE) private readonly maintenance: Queue,
  ) {}

  async status(): Promise<JobsStatus> {
    const beat = async (role: "worker" | "api") => {
      try {
        const raw = await redis().get(HEARTBEAT_KEY(role));
        return raw ? (JSON.parse(raw) as Beat) : null;
      } catch {
        return null;
      }
    };
    const queues = [this.lookups, this.bulkUpload, this.maintenance];
    const [worker, api, counts, finished] = await Promise.all([
      beat("worker"),
      beat("api"),
      Promise.all(queues.map((queue) => queue.getJobCounts("waiting", "active", "delayed", "failed", "completed", "prioritized"))),
      Promise.all(queues.map((queue) => queue.getJobs(["completed", "failed"], 0, 14))),
    ]);
    const recent = await Promise.all(
      finished.flat().map(async (job) => {
        const data = job.data as { name?: string; songVersionId?: string; filename?: string } | undefined;
        return {
          queue: job.queueName,
          name: job.name,
          state: (job.failedReason ? "failed" : "completed") as "completed" | "failed",
          finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          result: job.returnvalue ?? null,
          error: job.failedReason ?? null,
          // What it was about, shown beside it: an artist's name, a file's.
          subject: data?.name ?? data?.filename ?? null,
        };
      }),
    );
    recent.sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));
    return {
      worker,
      api,
      thisApiRunsJobs: jobsInApi(),
      queues: queues.map((queue, index) => {
        const c = counts[index]!;
        return { name: queue.name, waiting: (c.waiting ?? 0) + (c.prioritized ?? 0), active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0, completed: c.completed ?? 0 };
      }),
      recent: recent.slice(0, 15),
    };
  }
}
