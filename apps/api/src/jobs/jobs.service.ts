import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { BULK_UPLOAD_QUEUE } from "../bulk-upload/bulk-upload.types";
import { USER_MAINTENANCE_QUEUE } from "../user-management/transfer-expiry.processor";
import { BACKFILLS_QUEUE, HEARTBEAT_KEY, jobsInApi, LOOKUPS_QUEUE } from "./jobs.constants";
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
  /** The last jobs done, newest first. */
  recent: JobSummary[];
  /** The jobs that failed, newest first, with why (issue #93). */
  failed: JobSummary[];
  /** Failed jobs counted but whose details are gone (an older deployment's), by queue. */
  failedWithoutDetails: number;
}

export interface JobSummary {
  id: string | null;
  queue: string;
  name: string;
  state: "completed" | "failed";
  finishedAt: string | null;
  result: unknown;
  error: string | null;
  subject: string | null;
}

/** Background jobs' state, for Admin > Metadata (issue #92). */
@Injectable()
export class JobsService {
  constructor(
    @InjectQueue(LOOKUPS_QUEUE) private readonly lookups: Queue,
    @InjectQueue(BACKFILLS_QUEUE) private readonly backfills: Queue,
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
    const queues = [this.lookups, this.backfills, this.bulkUpload, this.maintenance];
    const [worker, api, counts, completed, failedJobs] = await Promise.all([
      beat("worker"),
      beat("api"),
      Promise.all(queues.map((queue) => queue.getJobCounts("waiting", "active", "delayed", "failed", "completed", "prioritized"))),
      Promise.all(queues.map((queue) => queue.getJobs(["completed"], 0, 14))),
      Promise.all(queues.map((queue) => queue.getJobs(["failed"], 0, 19))),
    ]);
    const summary = (state: "completed" | "failed") => (job: Job): JobSummary => {
      const data = job.data as { name?: string; songVersionId?: string; filename?: string } | undefined;
      return {
        id: job.id ?? null,
        queue: job.queueName,
        name: job.name,
        state,
        finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        result: job.returnvalue ?? null,
        error: job.failedReason || null,
        // What it was about, shown beside it: an artist's name, a file's.
        subject: data?.name ?? data?.filename ?? null,
      };
    };
    const newestFirst = (a: JobSummary, b: JobSummary) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? "");
    const recent = completed.flat().filter(Boolean).map(summary("completed")).sort(newestFirst);
    const failed = failedJobs.flat().filter(Boolean).map(summary("failed")).sort(newestFirst);
    // A queue counts failed jobs by their IDs; one whose details were removed isn't listed.
    const failedWithoutDetails = counts.reduce((sum, c, index) => sum + Math.max(0, (c.failed ?? 0) - Math.min(failedJobs[index]!.length, 20)), 0);
    return {
      worker,
      api,
      thisApiRunsJobs: jobsInApi(),
      queues: queues.map((queue, index) => {
        const c = counts[index]!;
        return { name: queue.name, waiting: (c.waiting ?? 0) + (c.prioritized ?? 0), active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0, completed: c.completed ?? 0 };
      }),
      recent: recent.slice(0, 15),
      failed: failed.slice(0, 20),
      failedWithoutDetails,
    };
  }

  /** Clears every queue's failed jobs (issue #93), those without details left too; returns how many. */
  async clearFailed(): Promise<{ cleared: number }> {
    let cleared = 0;
    for (const queue of [this.lookups, this.backfills, this.bulkUpload, this.maintenance]) {
      cleared += (await queue.clean(0, 100000, "failed")).length;
      // IDs left in the failed set with no job behind them: clean() only sees jobs it can read.
      const client = await queue.client;
      const key = queue.toKey("failed");
      const orphans = await client.zcard(key);
      if (orphans > 0) {
        await client.del(key);
        cleared += orphans;
      }
    }
    return { cleared };
  }
}
