import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { redis } from "../jobs/redis.js";
import { RATE_LIMIT_KEY } from "./rate-limit.decorator.js";
import { getEffectiveSecuritySettings } from "./security-settings.js";

const WINDOW_MS = 60_000;

/**
 * The client's address: the connection's, or - behind `trusted` proxies -
 * the one the outermost trusted proxy saw in X-Forwarded-For.
 */
export function clientAddress(req: Pick<Request, "headers" | "socket">, trusted: number): string {
  const socket = req.socket?.remoteAddress ?? "unknown";
  if (trusted <= 0) return socket;
  const header = req.headers["x-forwarded-for"];
  const hops = (Array.isArray(header) ? header.join(",") : (header ?? "")).split(",").map((part) => part.trim()).filter(Boolean);
  return hops[hops.length - trusted] ?? hops[0] ?? socket;
}

/**
 * Rate limits across the whole API (issue #113), after JwtAuthGuard: per
 * signed-in user - the web app's server calls for its users with their
 * token, so they never share its address's bucket - else per address; the
 * expensive routes (@RateLimit("heavy")) against a tighter limit too.
 * Counted in Redis, a minute at a time, so the API's instances share them;
 * without Redis, nothing's limited. Over: 429 with Retry-After.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const kind = this.reflector.getAllAndOverride<"heavy" | "none" | undefined>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (kind === "none") return true;
    const settings = await getEffectiveSecuritySettings();
    if (!settings.rateLimitEnabled) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest & Request>();
    const who = req.user ? `user:${req.user.id}` : `address:${clientAddress(req, settings.trustedProxies)}`;
    const window = Math.floor(Date.now() / WINDOW_MS);
    const checks: [string, number][] = [["all", req.user ? settings.rateLimitPerMinute : settings.rateLimitAnonymousPerMinute]];
    if (kind === "heavy") checks.push(["heavy", settings.rateLimitHeavyPerMinute]);
    for (const [bucket, limit] of checks) {
      let count: number;
      try {
        const key = `songverse:rl:${bucket}:${who}:${window}`;
        count = await redis().incr(key);
        if (count === 1) await redis().pexpire(key, WINDOW_MS);
      } catch {
        // Redis unreachable: not limited, rather than refused.
        return true;
      }
      if (count > limit) {
        const retryAfter = Math.max(1, Math.ceil(((window + 1) * WINDOW_MS - Date.now()) / 1000));
        context.switchToHttp().getResponse<Response>().setHeader("Retry-After", String(retryAfter));
        throw new HttpException(
          { statusCode: HttpStatus.TOO_MANY_REQUESTS, error: "Too Many Requests", message: [`Too many requests: try again in ${retryAfter} seconds`] },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }
}
