import { Injectable } from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** How long a file link works: a rehearsal's worth; a player whose link runs out asks for a new one. */
export const FILE_LINK_LIFETIME_MS = 60 * 60 * 1000;

/**
 * Short-lived links to one attachment (issue #33), for what can't send the
 * Bearer token - an <audio src>. Signed with a key derived from
 * BETTER_AUTH_SECRET, and handed out only after the same access check as a
 * download, so a link is only as good as a download was when it was given.
 */
@Injectable()
export class FileLinksService {
  private key(): Buffer {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
    return createHash("sha256").update(`songverse-file-links:${secret}`).digest();
  }

  private signature(attachmentId: string, expires: number): string {
    return createHmac("sha256", this.key()).update(`${attachmentId}.${expires}`).digest("base64url");
  }

  /** A path under the API (the client adds its own base URL) and when it stops working. */
  create(attachmentId: string, now = Date.now()): { path: string; expiresAt: string } {
    const expires = now + FILE_LINK_LIFETIME_MS;
    const query = new URLSearchParams({ expires: String(expires), signature: this.signature(attachmentId, expires) });
    return { path: `/files/${encodeURIComponent(attachmentId)}?${query}`, expiresAt: new Date(expires).toISOString() };
  }

  isValid(attachmentId: string, expires: string | undefined, signature: string | undefined, now = Date.now()): boolean {
    const at = Number(expires);
    if (!signature || !Number.isFinite(at) || at < now) return false;
    const expected = Buffer.from(this.signature(attachmentId, at));
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
