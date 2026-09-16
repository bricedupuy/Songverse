import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const API_ROOT = "https://musicbrainz.org/ws/2/";
// MusicBrainz's documented rate limit for standard (non-commercial-tier)
// API use is 1 request/second per client. This queue serializes every
// call through this service and enforces a minimum spacing, regardless of
// how many callers fire concurrently - see
// https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
const MIN_INTERVAL_MS = 1000;

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
  private readonly userAgent: string;

  constructor(private readonly config: ConfigService) {
    const contact = this.config.get<string>("MUSICBRAINZ_CONTACT") ?? "https://songverse.one";
    this.userAgent = `SongVerse/0.1.0 (${contact})`;
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
    const url = new URL(path, API_ROOT);
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("fmt", "json");

    const response = await fetch(url, {
      headers: { "User-Agent": this.userAgent, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new InternalServerErrorException(
        `MusicBrainz request failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as T;
  }
}
