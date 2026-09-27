import { Injectable } from "@nestjs/common";
import { isValidAddress, signAddress } from "../common/utils/signed-address";

/** How long a file link works: a rehearsal's worth; a player whose link runs out asks for a new one. */
export const FILE_LINK_LIFETIME_MS = 60 * 60 * 1000;

/**
 * Short-lived links to one attachment (issue #33), for what can't send the
 * Bearer token - an <audio src>. Signed (see signed-address.ts), and handed
 * out only after the same access check as a download, so a link is only as
 * good as a download was when it was given.
 */
@Injectable()
export class FileLinksService {
  /** A path under the API (the client adds its own base URL) and when it stops working. */
  create(attachmentId: string, now = Date.now()): { path: string; expiresAt: string } {
    const expires = now + FILE_LINK_LIFETIME_MS;
    const query = new URLSearchParams({ expires: String(expires), signature: signAddress("file-links", attachmentId, expires) });
    return { path: `/files/${encodeURIComponent(attachmentId)}?${query}`, expiresAt: new Date(expires).toISOString() };
  }

  isValid(attachmentId: string, expires: string | undefined, signature: string | undefined, now = Date.now()): boolean {
    return isValidAddress("file-links", attachmentId, expires, signature, now);
  }
}
