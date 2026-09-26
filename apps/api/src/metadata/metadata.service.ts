import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import {
  METADATA_PROVIDER_NAMES,
  METADATA_PROVIDERS,
  rankMetadataMatches,
  type MetadataMatch,
  type MetadataProviderKey,
  type MetadataSource,
  type ProviderMatch,
} from "@songverse/core";
import { ArtworkService } from "../artwork/artwork.service";
import { artworkAtSize, itunesLookup, itunesSearch, type ITunesSong } from "../artwork/itunes";
import { MusicBrainzService } from "../musicbrainz/musicbrainz.service";
import { PrismaService } from "../prisma/prisma.service";
import { deezerSearch, deezerTrack } from "./deezer.provider";

/** How long a search waits on a provider (MusicBrainz's queue included) before going on without it. */
const PROVIDER_TIMEOUT_MS = 15000;

export interface MetadataProviderSetting {
  key: MetadataProviderKey;
  name: string;
  enabled: boolean;
}

export interface EffectiveMetadataSettings {
  /** Every provider, in the order they're asked. */
  providers: MetadataProviderSetting[];
  source: "database" | "env" | "default";
}

export interface MetadataSearchResult {
  matches: MetadataMatch[];
  /** Providers that were asked and didn't answer. */
  unavailable: MetadataProviderKey[];
}

const isProvider = (key: unknown): key is MetadataProviderKey => (METADATA_PROVIDERS as readonly unknown[]).includes(key);

/** Every provider once, in the order listed, then those left out (off). */
function complete(listed: { key: MetadataProviderKey; enabled: boolean }[]): MetadataProviderSetting[] {
  const seen = new Set<MetadataProviderKey>();
  const providers: MetadataProviderSetting[] = [];
  for (const { key, enabled } of listed) {
    if (seen.has(key)) continue;
    seen.add(key);
    providers.push({ key, name: METADATA_PROVIDER_NAMES[key], enabled });
  }
  for (const key of METADATA_PROVIDERS) if (!seen.has(key)) providers.push({ key, name: METADATA_PROVIDER_NAMES[key], enabled: false });
  return providers;
}

function withTimeout<T>(promise: Promise<T>, provider: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${provider} took too long`)), PROVIDER_TIMEOUT_MS)),
  ]);
}

function appleMatch(song: ITunesSong): ProviderMatch | null {
  if (!song.trackId || !song.trackName) return null;
  return {
    title: song.trackName,
    artist: song.artistName ?? null,
    album: song.collectionName ?? null,
    releaseDate: song.releaseDate?.slice(0, 10) ?? null,
    artworkUrl: song.artworkUrl100 ? artworkAtSize(song.artworkUrl100, "800x800bb") : null,
    thumbnailUrl: song.artworkUrl100 ? artworkAtSize(song.artworkUrl100, "200x200bb") : null,
    source: { provider: "apple_music", id: String(song.trackId), url: song.trackViewUrl ?? `https://music.apple.com/song/${song.trackId}` },
  };
}

/**
 * Metadata providers (issue #22): Auto detect's search across MusicBrainz,
 * Apple Music and Deezer - whichever the admin has on, in their order -
 * merged and ranked (`rankMetadataMatches`), and a chosen match looked up
 * again from each of its sources.
 */
@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly musicBrainz: MusicBrainzService,
    private readonly artwork: ArtworkService,
  ) {}

  /** The database's list, else METADATA_PROVIDERS (the ones on, in order: "musicbrainz,apple_music"), else all of them. */
  async settings(): Promise<EffectiveMetadataSettings> {
    const row = await this.prisma.client.metadataSettings.findUnique({ where: { id: "singleton" } });
    if (row && Array.isArray(row.providers)) {
      const listed = (row.providers as { key?: unknown; enabled?: unknown }[]).filter((p) => isProvider(p?.key)) as { key: MetadataProviderKey; enabled: unknown }[];
      return { providers: complete(listed.map((p) => ({ key: p.key, enabled: p.enabled !== false }))), source: "database" };
    }
    const env = process.env.METADATA_PROVIDERS?.split(",").map((key) => key.trim().toLowerCase()).filter(isProvider);
    if (env?.length) return { providers: complete(env.map((key) => ({ key, enabled: true }))), source: "env" };
    return { providers: complete(METADATA_PROVIDERS.map((key) => ({ key, enabled: true }))), source: "default" };
  }

  /** Saves the providers' order and which are on; any left out are added, off. */
  async saveSettings(providers: { key: string; enabled: boolean }[]): Promise<EffectiveMetadataSettings> {
    const unknown = providers.find((p) => !isProvider(p.key));
    if (unknown) throw new BadRequestException(`Unknown metadata provider '${unknown.key}'`);
    const list = complete(providers as { key: MetadataProviderKey; enabled: boolean }[]).map(({ key, enabled }) => ({ key, enabled }));
    await this.prisma.client.metadataSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", providers: list },
      update: { providers: list },
    });
    return this.settings();
  }

  async resetSettings(): Promise<EffectiveMetadataSettings> {
    await this.prisma.client.metadataSettings.deleteMany({ where: { id: "singleton" } });
    return this.settings();
  }

  /** Every provider that's on, at once; one that fails or is slow is left out rather than failing the search. */
  async search(title: string, artist?: string | null): Promise<MetadataSearchResult> {
    const order = (await this.settings()).providers.filter((p) => p.enabled).map((p) => p.key);
    if (order.length === 0) throw new ServiceUnavailableException("No metadata provider is turned on");
    const settled = await Promise.allSettled(order.map((provider) => withTimeout(this.searchOne(provider, title, artist), provider)));
    const results: Partial<Record<MetadataProviderKey, ProviderMatch[]>> = {};
    const unavailable: MetadataProviderKey[] = [];
    settled.forEach((outcome, index) => {
      const provider = order[index]!;
      if (outcome.status === "fulfilled") results[provider] = outcome.value;
      else {
        unavailable.push(provider);
        this.logger.warn(`${provider} search failed: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
      }
    });
    if (unavailable.length === order.length) throw new ServiceUnavailableException("The metadata providers are unavailable — try again in a moment");
    return { matches: rankMetadataMatches(results, order, title, artist), unavailable };
  }

  /**
   * A chosen match, looked up again from its sources rather than taken
   * from the client: the details of the first (in the providers' order),
   * the earliest release date, the first artwork. Sources that can't be
   * looked up are left out; none at all is an error.
   */
  async lookup(sources: Pick<MetadataSource, "provider" | "id">[]): Promise<MetadataMatch> {
    const order = (await this.settings()).providers.map((p) => p.key);
    const wanted = [...new Map(sources.map((s) => [s.provider, s])).values()].sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider));
    const settled = await Promise.allSettled(wanted.map((source) => withTimeout(this.lookupOne(source.provider, source.id), source.provider)));
    const found = settled.flatMap((outcome) => (outcome.status === "fulfilled" && outcome.value ? [outcome.value] : []));
    if (found.length === 0) {
      const notFound = settled.every((outcome) => outcome.status === "fulfilled" || outcome.reason instanceof NotFoundException);
      if (notFound) throw new NotFoundException("That match can't be found anymore");
      throw new ServiceUnavailableException("The metadata providers are unavailable — try again in a moment");
    }
    const [first, ...others] = found;
    const { source, ...details } = first!;
    const match: MetadataMatch = { ...details, sources: [source] };
    for (const other of others) {
      match.sources.push(other.source);
      if (other.releaseDate && (!match.releaseDate || other.releaseDate.slice(0, 4) < match.releaseDate.slice(0, 4))) match.releaseDate = other.releaseDate;
      match.artworkUrl ??= other.artworkUrl;
      match.thumbnailUrl ??= other.thumbnailUrl;
    }
    return match;
  }

  private async searchOne(provider: MetadataProviderKey, title: string, artist?: string | null): Promise<ProviderMatch[]> {
    switch (provider) {
      case "musicbrainz":
        return this.musicBrainz.searchMatches(title, artist);
      case "apple_music": {
        const { country } = await this.artwork.settings();
        return (await itunesSearch([title, artist].filter(Boolean).join(" "), country, 25)).map(appleMatch).filter((m): m is ProviderMatch => !!m);
      }
      case "deezer":
        return deezerSearch(title, artist);
    }
  }

  private async lookupOne(provider: MetadataProviderKey, id: string): Promise<ProviderMatch | null> {
    switch (provider) {
      case "musicbrainz":
        return this.musicBrainz.match(id);
      case "apple_music": {
        if (!/^\d+$/.test(id)) throw new NotFoundException("Not an Apple Music track ID");
        const song = await itunesLookup(id, (await this.artwork.settings()).country);
        if (!song) throw new NotFoundException("No such Apple Music track");
        return appleMatch(song);
      }
      case "deezer":
        return deezerTrack(id).catch((err: Error) => {
          throw /no data|not a deezer/i.test(err.message) ? new NotFoundException(err.message) : err;
        });
    }
  }
}
