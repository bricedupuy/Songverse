import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { MusicBrainzRecordingMatch, MusicBrainzWorkMatch } from "@songverse/core";
import { MusicBrainzClientService, MusicBrainzRequestError } from "./musicbrainz-client.service";

/** Only a genuine upstream 404 means "doesn't exist" - anything else (a
 * network failure, or a 503 that outlasted our retries) is transient and
 * must not be reported as if the record were missing. */
function rethrowLookupFailure(err: unknown, notFoundMessage: string): never {
  if (err instanceof MusicBrainzRequestError && err.status === 404) {
    throw new NotFoundException(notFoundMessage);
  }
  throw asServiceError();
}

function asServiceError(): ServiceUnavailableException {
  return new ServiceUnavailableException("MusicBrainz is temporarily unavailable — try again in a moment");
}

interface MbArtistCredit {
  name: string;
}

interface MbRelease {
  title: string;
  date?: string;
}

interface MbRecording {
  id: string;
  title: string;
  score?: number;
  "artist-credit"?: MbArtistCredit[];
  releases?: MbRelease[];
}

interface MbRecordingSearchResponse {
  recordings?: MbRecording[];
}

interface MbWork {
  id: string;
  title: string;
  score?: number;
  languages?: string[];
  iswcs?: string[];
}

interface MbWorkSearchResponse {
  works?: MbWork[];
}

// MusicBrainz's Lucene-based search syntax treats these characters as
// operators - a raw title/artist containing one (e.g. `Wake Up (Reprise)`)
// would otherwise break the query or silently narrow the match.
// See https://musicbrainz.org/doc/MusicBrainz_API/Search#Lucene_query_syntax
function escapeLucene(value: string): string {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

function artistCreditName(credits?: MbArtistCredit[]): string | null {
  if (!credits || credits.length === 0) return null;
  return credits.map((c) => c.name).join(" & ");
}

function mapRecording(recording: MbRecording): MusicBrainzRecordingMatch {
  const release = recording.releases?.[0];
  return {
    mbid: recording.id,
    title: recording.title,
    artist: artistCreditName(recording["artist-credit"]),
    releaseTitle: release?.title ?? null,
    releaseDate: release?.date ?? null,
    score: recording.score ?? 100,
    sourceUrl: `https://musicbrainz.org/recording/${recording.id}`,
  };
}

function mapWork(work: MbWork): MusicBrainzWorkMatch {
  return {
    mbid: work.id,
    title: work.title,
    iswc: work.iswcs?.[0] ?? null,
    language: work.languages?.[0] ?? null,
    score: work.score ?? 100,
    sourceUrl: `https://musicbrainz.org/work/${work.id}`,
  };
}

@Injectable()
export class MusicBrainzService {
  constructor(private readonly client: MusicBrainzClientService) {}

  async searchRecordings(title: string, artist?: string): Promise<MusicBrainzRecordingMatch[]> {
    try {
      const titleQuery = `recording:"${escapeLucene(title)}"`;
      if (artist) {
        // AND-ing artist onto the query is a strict match - a slightly
        // off spelling/variant zeroes out an otherwise-good title match
        // (reported as "sometimes no results" in production). Fall back
        // to a title-only search rather than surface nothing.
        const combined = await this.client.get<MbRecordingSearchResponse>("recording", {
          query: `${titleQuery} AND artist:"${escapeLucene(artist)}"`,
          limit: "10",
        });
        if (combined.recordings?.length) return combined.recordings.map(mapRecording);
      }
      const result = await this.client.get<MbRecordingSearchResponse>("recording", { query: titleQuery, limit: "10" });
      return (result.recordings ?? []).map(mapRecording);
    } catch {
      throw asServiceError();
    }
  }

  async searchWorks(title: string): Promise<MusicBrainzWorkMatch[]> {
    try {
      const result = await this.client.get<MbWorkSearchResponse>("work", {
        query: `work:"${escapeLucene(title)}"`,
        limit: "10",
      });
      return (result.works ?? []).map(mapWork);
    } catch {
      throw asServiceError();
    }
  }

  async getRecording(mbid: string): Promise<MusicBrainzRecordingMatch> {
    try {
      const recording = await this.client.get<MbRecording>(`recording/${mbid}`, {
        inc: "artist-credits+releases",
      });
      return mapRecording(recording);
    } catch (err) {
      rethrowLookupFailure(err, "MusicBrainz recording not found");
    }
  }

  async getWork(mbid: string): Promise<MusicBrainzWorkMatch> {
    try {
      const work = await this.client.get<MbWork>(`work/${mbid}`, {});
      return mapWork(work);
    } catch (err) {
      rethrowLookupFailure(err, "MusicBrainz work not found");
    }
  }
}
