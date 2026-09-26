import { Redis } from "ioredis";

let client: Redis | null = null;

/**
 * This process's Redis connection for what isn't a queue (issue #92): the
 * Worker's heartbeat, rate limits shared by every process. The queues keep
 * their own (BullMQ's).
 */
export function redis(): Redis {
  client ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: 2, lazyConnect: false });
  return client;
}

/**
 * Waits for a turn at a rate limit shared by every process - the API's
 * instances and the Worker - through Redis: one call per `intervalMs` for
 * `name`. Without Redis, doesn't wait (each process still keeps its own).
 */
export async function sharedTurn(name: string, intervalMs: number): Promise<void> {
  const key = `songverse:rate:${name}`;
  for (let tries = 0; tries < 120; tries++) {
    let wait: number;
    try {
      if ((await redis().set(key, "1", "PX", intervalMs, "NX")) === "OK") return;
      wait = await redis().pttl(key);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(wait, 20)));
  }
}
