import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

/** Where MusicBrainz's API is; pointed elsewhere only by the e2e suites. */
const apiRoot = () => process.env.MUSICBRAINZ_API_URL ?? "https://musicbrainz.org/ws/2/";
// MusicBrainz's documented rate limit for standard (non-commercial-tier)
// API use is 1 request/second per client. This queue serializes every
// call through this service and enforces a minimum spacing, regardless of
// how many callers fire concurrently - see
// https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
const MIN_INTERVAL_MS = 1000;
// MusicBrainz's documented behavior when a client exceeds the rate limit
// is a 503 - their own docs describe this as expected/transient and say
// to back off and retry, not treat it as a real error.
const MAX_503_RETRIES = 3;

/** Carries the real upstream status so callers can tell "MusicBrainz said
 * 404" (a genuine not-found) apart from a transient failure - previously
 * every non-2xx response was flattened into one generic error, which made
 * a temporary rate-limit response on a recording lookup indistinguishable
 * from the recording genuinely not existing (seen in production: linking
 * a recording picked from real search results failed with "not found"). */
export class MusicBrainzRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MusicBrainzRequestError";
  }
}

/**
 * Low-level MusicBrainz HTTP client: rate limiting and the required
 * identifying User-Agent live here, once, so every caller gets them for
 * free. MusicBrainz blocks clients that send a generic/missing User-Agent
 * or exceed the rate limit - see
 * https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting#Provide_meaningful_User-Agent_strings
 */
@Injectable()
export class MusicBrainzClientService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** The contact MusicBrainz is told (issue #89): Admin > Metadata's, else MUSICBRAINZ_CONTACT, else Songverse's site. */
  private async userAgent(): Promise<string> {
    const row = await this.prisma.client.metadataSettings.findUnique({ where: { id: "singleton" }, select: { musicbrainzContact: true } });
    const contact = row?.musicbrainzContact || this.config.get<string>("MUSICBRAINZ_CONTACT") || "https://songverse.one";
    return `Songverse/0.1.0 (${contact})`;
  }

  async get<T>(path: string, searchParams: Record<string, string>): Promise<T> {
    // Chain onto the queue so calls are serialized and spaced >= 1s apart,
    // no matter how many requests come in concurrently.
    const run = this.queue.then(() => this.fetchNow<T>(path, searchParams));
    // Swallow errors here so one failed request doesn't wedge the queue for
    // subsequent callers - each caller still gets the real rejection below.
    this.queue = run.catch(() => undefined).then(() => new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS)));
    return run;
  }

  private async fetchNow<T>(path: string, searchParams: Record<string, string>): Promise<T> {
    const url = new URL(path, apiRoot());
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("fmt", "json");
    const userAgent = await this.userAgent();

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
      });
      if (response.ok) return (await response.json()) as T;

      if (response.status === 503 && attempt < MAX_503_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS * (attempt + 1)));
        continue;
      }
      throw new MusicBrainzRequestError(
        response.status,
        `MusicBrainz request failed: ${response.status} ${response.statusText}`,
      );
    }
  }
}
