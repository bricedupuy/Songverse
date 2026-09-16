import { Injectable, NotFoundException } from "@nestjs/common";
import type { MusicBrainzRecordingMatch, MusicBrainzWorkMatch } from "@songverse/core";
import { MusicBrainzClientService } from "./musicbrainz-client.service";

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
    let query = `recording:"${escapeLucene(title)}"`;
    if (artist) query += ` AND artist:"${escapeLucene(artist)}"`;

    const result = await this.client.get<MbRecordingSearchResponse>("recording", {
      query,
      limit: "10",
    });
    return (result.recordings ?? []).map(mapRecording);
  }

  async searchWorks(title: string): Promise<MusicBrainzWorkMatch[]> {
    const result = await this.client.get<MbWorkSearchResponse>("work", {
      query: `work:"${escapeLucene(title)}"`,
      limit: "10",
    });
    return (result.works ?? []).map(mapWork);
  }

  async getRecording(mbid: string): Promise<MusicBrainzRecordingMatch> {
    const recording = await this.client
      .get<MbRecording>(`recording/${mbid}`, { inc: "artist-credits+releases" })
      .catch(() => null);
    if (!recording) throw new NotFoundException("MusicBrainz recording not found");
    return mapRecording(recording);
  }

  async getWork(mbid: string): Promise<MusicBrainzWorkMatch> {
    const work = await this.client.get<MbWork>(`work/${mbid}`, {}).catch(() => null);
    if (!work) throw new NotFoundException("MusicBrainz work not found");
    return mapWork(work);
  }
}
