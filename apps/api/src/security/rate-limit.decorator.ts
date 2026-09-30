import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "rateLimit";

/**
 * How a route counts against the rate limits (issue #113): "heavy" - an
 * upload, a lookup at an outside service, a join by link - also counts
 * against the tighter limit; "none" - an address signed by the API (a file
 * link, an image), already allowed once - doesn't count at all.
 */
export const RateLimit = (kind: "heavy" | "none") => SetMetadata(RATE_LIMIT_KEY, kind);
