/**
 * Background jobs (issue #92). Every processor is created stopped
 * (`autorun: false`) and started by `startJobs()` in the process that runs
 * them: the Worker always; the API only with JOBS_IN_API (by default, out
 * of production - `pnpm dev` without a Worker).
 */
export const JOB_WORKER_OPTIONS = { autorun: false } as const;

export const LOOKUPS_QUEUE = "lookups";

/** Whether this API process runs jobs itself: JOBS_IN_API, else only out of production. */
export function jobsInApi(): boolean {
  const said = process.env.JOBS_IN_API?.trim().toLowerCase();
  if (said) return ["true", "1", "yes", "on"].includes(said);
  return process.env.NODE_ENV !== "production";
}

/** Where a process that runs jobs says it's alive, refreshed every 15 seconds, gone after a minute. */
export const HEARTBEAT_KEY = (role: "worker" | "api") => `songverse:jobs:${role}`;
