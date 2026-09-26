import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ImageService, type ProcessedImage } from "../images/image.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { artworkAtSize, itunesBase, itunesSearch } from "./itunes";

/** Where Deezer's API is (its covers are allowed too); pointed elsewhere only by the e2e suites. */
const deezerTestOrigin = () => (process.env.DEEZER_API_URL ? new URL(process.env.DEEZER_API_URL).origin : null);
const TIMEOUT_MS = 8000;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
/** The size of Apple's artwork kept (it's then made 800px WebP). */
const ARTWORK_SIZE = "800x800bb";

export interface ArtworkCandidate {
  title: string;
  artist: string;
  album: string | null;
  releaseDate: string | null;
  /** The artwork, full size (what gets stored). */
  artworkUrl: string;
  /** A small one, to choose from. */
  thumbnailUrl: string;
}

export interface EffectiveArtworkSettings {
  enabled: boolean;
  country: string;
  source: "database" | "default";
}

/** Folded for matching: lower case, no accents, no punctuation or "(Live)"-style asides. */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Song artwork (issue #85): the album or single's image from Apple Music
 * (the iTunes Search API), downloaded and kept on our storage - found on
 * its own for a new song, or chosen among the matches.
 */
@Injectable()
export class ArtworkService {
  private readonly logger = new Logger(ArtworkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly images: ImageService,
  ) {}

  async settings(): Promise<EffectiveArtworkSettings> {
    const row = await this.prisma.client.artworkSettings.findUnique({ where: { id: "singleton" } });
    return { enabled: row?.enabled ?? true, country: row?.country || "us", source: row ? "database" : "default" };
  }

  async saveSettings(change: { enabled?: boolean; country?: string }): Promise<EffectiveArtworkSettings> {
    const country = change.country === undefined ? undefined : change.country.trim().toLowerCase() || null;
    if (country && !/^[a-z]{2}$/.test(country)) throw new BadRequestException("A country is two letters, like us or fr");
    await this.prisma.client.artworkSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", enabled: change.enabled ?? true, country: country ?? null },
      update: { ...(change.enabled !== undefined && { enabled: change.enabled }), ...(country !== undefined && { country }) },
    });
    return this.settings();
  }

  async resetSettings(): Promise<EffectiveArtworkSettings> {
    await this.prisma.client.artworkSettings.deleteMany({ where: { id: "singleton" } });
    return this.settings();
  }

  /** Apple Music's matches for a title and artist, each artwork once. */
  async search(title: string, artist: string | null): Promise<ArtworkCandidate[]> {
    const { country } = await this.settings();
    const results = await itunesSearch([title, artist].filter(Boolean).join(" "), country);
    const seen = new Set<string>();
    const candidates: ArtworkCandidate[] = [];
    for (const result of results) {
      if (!result.artworkUrl100 || !result.trackName) continue;
      const artworkUrl = artworkAtSize(result.artworkUrl100, ARTWORK_SIZE);
      if (seen.has(artworkUrl)) continue;
      seen.add(artworkUrl);
      candidates.push({
        title: result.trackName,
        artist: result.artistName ?? "",
        album: result.collectionName ?? null,
        releaseDate: result.releaseDate?.slice(0, 10) ?? null,
        artworkUrl,
        thumbnailUrl: artworkAtSize(result.artworkUrl100, "200x200bb"),
      });
    }
    return candidates;
  }

  /** The candidates for a song, from its title and first artist. */
  async candidatesFor(songVersionId: string): Promise<ArtworkCandidate[]> {
    const song = await this.songForArtwork(songVersionId);
    return this.search(song.title, song.artist);
  }

  /** Downloads the artwork at `url` (Apple Music's or Deezer's only), keeps it and makes it the song's image. */
  async setFromUrl(songVersionId: string, url: string, options: { onlyIfNone?: boolean } = {}): Promise<boolean> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException("Not an address");
    }
    if (!this.allowedHost(parsed)) throw new BadRequestException("Artwork comes from Apple Music or Deezer only");
    const res = await fetch(parsed, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new BadRequestException(`Couldn't download the artwork (${res.status})`);
    if (!(res.headers.get("content-type") ?? "").startsWith("image/")) throw new BadRequestException("That isn't an image");
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_DOWNLOAD_BYTES) throw new BadRequestException("That image is too big");
    let image: ProcessedImage;
    try {
      image = await this.images.normalizeArtwork(body);
    } catch {
      throw new BadRequestException("That image can't be read");
    }
    const { hash } = await this.storage.put(image.body, image.contentType);
    const before = await this.prisma.client.songVersion.findUniqueOrThrow({ where: { id: songVersionId }, select: { imageStorageKey: true } });
    // Found on its own, it doesn't replace one set in the meantime (from the song info chosen as it was created, say).
    const { count } = await this.prisma.client.songVersion.updateMany({
      where: { id: songVersionId, ...(options.onlyIfNone && { imageStorageKey: null }) },
      data: { imageStorageKey: hash, imageSourceUrl: parsed.toString() },
    });
    if (count === 0) {
      await this.storage.deleteUnreferenced([hash]);
      return false;
    }
    // The image it had before, unless another song (or file) still has it.
    if (before.imageStorageKey && before.imageStorageKey !== hash) await this.storage.deleteUnreferenced([before.imageStorageKey]);
    return true;
  }

  async clear(songVersionId: string): Promise<void> {
    const song = await this.prisma.client.songVersion.findUniqueOrThrow({ where: { id: songVersionId }, select: { imageStorageKey: true } });
    await this.prisma.client.songVersion.update({ where: { id: songVersionId }, data: { imageStorageKey: null, imageSourceUrl: null } });
    if (song.imageStorageKey) await this.storage.deleteUnreferenced([song.imageStorageKey]);
  }

  /**
   * Finds a song's artwork on its own: of the matches whose title is the
   * song's and whose artist is one of its artists (or any, when it has
   * none), the earliest release's - the song's first, not a later
   * compilation (issue #22). Nothing when artwork is off, the song has an image, or nothing
   * matches closely enough. Never throws.
   */
  async autoFind(songVersionId: string): Promise<boolean> {
    try {
      if (!(await this.settings()).enabled) return false;
      const song = await this.songForArtwork(songVersionId);
      if (song.hasImage) return false;
      const title = fold(song.title);
      const artists = song.artists.map(fold).filter(Boolean);
      const year = (candidate: ArtworkCandidate) => candidate.releaseDate?.slice(0, 4) ?? "9999";
      const match = (await this.search(song.title, song.artist))
        .filter((candidate) => fold(candidate.title) === title && (artists.length === 0 || artists.some((artist) => fold(candidate.artist).includes(artist) || artist.includes(fold(candidate.artist)))))
        .sort((a, b) => year(a).localeCompare(year(b)))[0];
      if (!match) return false;
      return await this.setFromUrl(songVersionId, match.artworkUrl, { onlyIfNone: true });
    } catch (err) {
      this.logger.warn(`No artwork for ${songVersionId}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Finds artwork for songs without an image, a few at a time (Apple limits how fast it's asked). */
  async backfill(limit = 50): Promise<{ tried: number; found: number }> {
    const songs = await this.prisma.client.songVersion.findMany({
      where: { imageStorageKey: null, imageSourceUrl: null },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    let found = 0;
    for (const song of songs) {
      if (await this.autoFind(song.id)) found++;
      // Not tried again next time when nothing matched.
      else await this.prisma.client.songVersion.updateMany({ where: { id: song.id, imageStorageKey: null }, data: { imageSourceUrl: "none" } });
      await new Promise((resolve) => setTimeout(resolve, process.env.ITUNES_SEARCH_URL ? 0 : 3000));
    }
    return { tried: songs.length, found };
  }

  /** A song's image, resized: only with a valid key (checked by the caller's signature). */
  async image(songVersionId: string, storageKey: string, width: number): Promise<ProcessedImage> {
    const song = await this.prisma.client.songVersion.findUnique({ where: { id: songVersionId }, select: { imageStorageKey: true } });
    if (!song || song.imageStorageKey !== storageKey) throw new NotFoundException("No such image");
    return this.images.resize(storageKey, () => this.storage.get(storageKey), width);
  }

  private allowedHost(url: URL): boolean {
    const on = (domain: string) => url.hostname === domain || url.hostname.endsWith(`.${domain}`);
    if (url.protocol === "https:" && (on("mzstatic.com") || on("dzcdn.net"))) return true;
    // The e2e suites' stand-ins for Apple and Deezer serve their artwork too.
    return (!!process.env.ITUNES_SEARCH_URL && url.origin === new URL(itunesBase()).origin) || url.origin === deezerTestOrigin();
  }

  private async songForArtwork(songVersionId: string) {
    const song = await this.prisma.client.songVersion.findUnique({
      where: { id: songVersionId },
      select: {
        title: true,
        imageStorageKey: true,
        contributors: { where: { roles: { has: "PERFORMER" } }, select: { source: true }, orderBy: { displayOrder: "asc" } },
      },
    });
    if (!song) throw new NotFoundException("Song version not found");
    const artists = song.contributors.map((c) => c.source).filter((name): name is string => !!name);
    return { title: song.title, artist: artists[0] ?? null, artists, hasImage: !!song.imageStorageKey };
  }
}
