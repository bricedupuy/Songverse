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
import { Prisma } from "@songverse/db";
import { decryptSecret, encryptSecret } from "@songverse/secret-crypto";
import { ArtworkService } from "../artwork/artwork.service";
import { artworkAtSize, itunesLookup, itunesSearch, type ITunesSong } from "../artwork/itunes";
import { MusicBrainzService } from "../musicbrainz/musicbrainz.service";
import { PrismaService } from "../prisma/prisma.service";
import { appleMusicSearch, appleMusicSong, musicKitKeyProblem, type AppleMusicAuth, type MusicKitCredentials } from "./apple-music-api";
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
  /** The Apple Music API's MusicKit key (issue #87) - never the private key itself, only whether the database has one. */
  appleMusic: {
    /** What signs requests: a key (saved here, or env vars), else a developer token address, else nothing (iTunes Search). */
    source: "database" | "env" | "tokenUrl" | "none";
    teamId: string | null;
    keyId: string | null;
    hasDatabasePrivateKey: boolean;
    /** The developer token address (saved here, or APPLE_MUSIC_TOKEN_URL), used while there's no key. */
    tokenUrl: string | null;
    tokenUrlSource: "database" | "env" | "none";
  };
}

export interface SaveAppleMusicInput {
  teamId?: string;
  keyId?: string;
  /** The .p8 file's text; left out, the one saved stays. */
  privateKey?: string;
  /** An address handing out developer tokens, until there's a key. */
  tokenUrl?: string;
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
    const appleMusic = this.appleMusicSummary(row);
    if (row && Array.isArray(row.providers)) {
      const listed = (row.providers as { key?: unknown; enabled?: unknown }[]).filter((p) => isProvider(p?.key)) as { key: MetadataProviderKey; enabled: unknown }[];
      return { providers: complete(listed.map((p) => ({ key: p.key, enabled: p.enabled !== false }))), source: "database", appleMusic };
    }
    const env = process.env.METADATA_PROVIDERS?.split(",").map((key) => key.trim().toLowerCase()).filter(isProvider);
    if (env?.length) return { providers: complete(env.map((key) => ({ key, enabled: true }))), source: "env", appleMusic };
    return { providers: complete(METADATA_PROVIDERS.map((key) => ({ key, enabled: true }))), source: "default", appleMusic };
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

  /** Back to METADATA_PROVIDERS or the default order; the Apple Music key stays. */
  async resetSettings(): Promise<EffectiveMetadataSettings> {
    await this.prisma.client.metadataSettings.updateMany({ where: { id: "singleton" }, data: { providers: Prisma.DbNull } });
    return this.settings();
  }

  /**
   * Saves the MusicKit key (issue #87), a field left out keeping its value
   * and an empty one clearing it. The private key is checked, then kept
   * encrypted.
   */
  async saveAppleMusic(input: SaveAppleMusicInput): Promise<EffectiveMetadataSettings> {
    const clean = (value: string | undefined) => (value === undefined ? undefined : value.trim() || null);
    const teamId = clean(input.teamId);
    const keyId = clean(input.keyId);
    const privateKey = clean(input.privateKey);
    const tokenUrl = clean(input.tokenUrl);
    if (tokenUrl) {
      let url: URL | null = null;
      try {
        url = new URL(tokenUrl);
      } catch {
        // reported below
      }
      const local = url?.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
      if (!url || (url.protocol !== "https:" && !local)) throw new BadRequestException("A developer token address is an https:// address");
    }
    for (const [name, value] of [
      ["team ID", teamId],
      ["key ID", keyId],
    ] as const) {
      if (value && !/^[A-Z0-9]{10}$/.test(value)) throw new BadRequestException(`An Apple ${name} is 10 letters and digits, like ABCDE12345`);
    }
    let privateKeyEnc: string | null | undefined;
    if (privateKey) {
      const problem = musicKitKeyProblem(privateKey);
      if (problem) throw new BadRequestException(problem);
      privateKeyEnc = encryptSecret(privateKey, process.env.SETTINGS_ENCRYPTION_KEY);
    } else if (privateKey === null) privateKeyEnc = null;
    const data = {
      ...(teamId !== undefined && { appleMusicTeamId: teamId }),
      ...(keyId !== undefined && { appleMusicKeyId: keyId }),
      ...(privateKeyEnc !== undefined && { appleMusicPrivateKeyEnc: privateKeyEnc }),
      ...(tokenUrl !== undefined && { appleMusicTokenUrl: tokenUrl }),
    };
    await this.prisma.client.metadataSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
    return this.settings();
  }

  /** Back to the APPLE_MUSIC_* env vars, or the iTunes Search API without them; the providers' order stays. */
  async resetAppleMusic(): Promise<EffectiveMetadataSettings> {
    await this.prisma.client.metadataSettings.updateMany({
      where: { id: "singleton" },
      data: { appleMusicTeamId: null, appleMusicKeyId: null, appleMusicPrivateKeyEnc: null, appleMusicTokenUrl: null },
    });
    return this.settings();
  }

  /** Tries the key (or token address) with a search, so an admin knows it works before a song needs it. */
  async testAppleMusic(): Promise<{ ok: boolean; message: string }> {
    const auth = await this.appleMusicAuth();
    if (!auth) return { ok: false, message: "No MusicKit key or developer token address is set: Apple Music is searched through iTunes Search." };
    try {
      const found = await appleMusicSearch("Amazing Grace", (await this.artwork.settings()).country, auth);
      return { ok: true, message: `The Apple Music API answered (${found.length} songs for "Amazing Grace").` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * The MusicKit key in use: the database's, when it has all three parts,
   * else the APPLE_MUSIC_TEAM_ID / APPLE_MUSIC_KEY_ID /
   * APPLE_MUSIC_PRIVATE_KEY env vars, else none (iTunes Search).
   */
  async appleMusicCredentials(): Promise<MusicKitCredentials | null> {
    const row = await this.prisma.client.metadataSettings.findUnique({ where: { id: "singleton" } });
    if (row?.appleMusicTeamId && row.appleMusicKeyId && row.appleMusicPrivateKeyEnc) {
      try {
        return { teamId: row.appleMusicTeamId, keyId: row.appleMusicKeyId, privateKey: decryptSecret(row.appleMusicPrivateKeyEnc, process.env.SETTINGS_ENCRYPTION_KEY) };
      } catch (err) {
        this.logger.warn(`The saved MusicKit key can't be decrypted (was SETTINGS_ENCRYPTION_KEY changed?): ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    }
    const { APPLE_MUSIC_TEAM_ID: teamId, APPLE_MUSIC_KEY_ID: keyId, APPLE_MUSIC_PRIVATE_KEY: privateKey } = process.env;
    // A key in an env var often has its line breaks written as \n.
    return teamId && keyId && privateKey ? { teamId, keyId, privateKey: privateKey.replace(/\\n/g, "\n") } : null;
  }

  /**
   * How Apple Music API requests are signed: the MusicKit key, else a token
   * from the developer token address (saved here, else
   * APPLE_MUSIC_TOKEN_URL) - a stopgap, whose tokens aren't signed by this
   * server's own Apple account - else none (iTunes Search).
   */
  async appleMusicAuth(): Promise<AppleMusicAuth | null> {
    const credentials = await this.appleMusicCredentials();
    if (credentials) return { kind: "key", credentials };
    const row = await this.prisma.client.metadataSettings.findUnique({ where: { id: "singleton" }, select: { appleMusicTokenUrl: true } });
    const url = row?.appleMusicTokenUrl || process.env.APPLE_MUSIC_TOKEN_URL;
    return url ? { kind: "tokenUrl", url } : null;
  }

  private appleMusicSummary(
    row: { appleMusicTeamId: string | null; appleMusicKeyId: string | null; appleMusicPrivateKeyEnc: string | null; appleMusicTokenUrl: string | null } | null,
  ): EffectiveMetadataSettings["appleMusic"] {
    const hasDatabasePrivateKey = !!row?.appleMusicPrivateKeyEnc;
    const tokenUrl = row?.appleMusicTokenUrl || process.env.APPLE_MUSIC_TOKEN_URL || null;
    const token = { tokenUrl, tokenUrlSource: row?.appleMusicTokenUrl ? ("database" as const) : tokenUrl ? ("env" as const) : ("none" as const) };
    if (row?.appleMusicTeamId && row.appleMusicKeyId && hasDatabasePrivateKey) {
      return { source: "database", teamId: row.appleMusicTeamId, keyId: row.appleMusicKeyId, hasDatabasePrivateKey, ...token };
    }
    const { APPLE_MUSIC_TEAM_ID: teamId, APPLE_MUSIC_KEY_ID: keyId, APPLE_MUSIC_PRIVATE_KEY: privateKey } = process.env;
    if (teamId && keyId && privateKey) return { source: "env", teamId, keyId, hasDatabasePrivateKey, ...token };
    return { source: tokenUrl ? "tokenUrl" : "none", teamId: row?.appleMusicTeamId ?? null, keyId: row?.appleMusicKeyId ?? null, hasDatabasePrivateKey, ...token };
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
      match.isrc ??= other.isrc;
      if (!match.composers?.length && other.composers?.length) match.composers = other.composers;
    }
    return match;
  }

  private async searchOne(provider: MetadataProviderKey, title: string, artist?: string | null): Promise<ProviderMatch[]> {
    switch (provider) {
      case "musicbrainz":
        return this.musicBrainz.searchMatches(title, artist);
      case "apple_music": {
        const { country } = await this.artwork.settings();
        const term = [title, artist].filter(Boolean).join(" ");
        // With a MusicKit key (or a token address), the Apple Music API (issue #87): the same songs, with their ISRC and writers.
        const auth = await this.appleMusicAuth();
        if (auth) return appleMusicSearch(term, country, auth);
        return (await itunesSearch(term, country, 25)).map(appleMatch).filter((m): m is ProviderMatch => !!m);
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
        const { country } = await this.artwork.settings();
        const auth = await this.appleMusicAuth();
        const found = auth ? await appleMusicSong(id, country, auth) : await itunesLookup(id, country).then((song) => song && appleMatch(song));
        if (!found) throw new NotFoundException("No such Apple Music track");
        return found;
      }
      case "deezer":
        return deezerTrack(id).catch((err: Error) => {
          throw /no data|not a deezer/i.test(err.message) ? new NotFoundException(err.message) : err;
        });
    }
  }
}
