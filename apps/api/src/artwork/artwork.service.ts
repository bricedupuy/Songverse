import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ImageService, type ProcessedImage } from "../images/image.service";
import { MetadataService, type ArtworkCandidate } from "../metadata/metadata.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

export type { ArtworkCandidate };

/** How a song's automatic artwork went (issue #93). */
export type ArtworkOutcome = "found" | "nomatch" | "failed" | "skipped";

/** The suites' stand-ins' origins, whose artwork is allowed too. */
const testOrigins = () =>
  [process.env.ITUNES_SEARCH_URL, process.env.DEEZER_API_URL, process.env.SPOTIFY_API_URL, process.env.APPLE_MUSIC_API_URL]
    .filter((url): url is string => !!url)
    .map((url) => new URL(url).origin);
const TIMEOUT_MS = 8000;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

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
    private readonly metadata: MetadataService,
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

  /** The artwork providers' matches for a title and artist (issue #89), in their order, each artwork once. */
  search(title: string, artist: string | null): Promise<ArtworkCandidate[]> {
    return this.metadata.artworkCandidates(title, artist);
  }

  /** The candidates for a song, from its title and first artist. */
  async candidatesFor(songVersionId: string): Promise<ArtworkCandidate[]> {
    const song = await this.songForArtwork(songVersionId);
    return this.search(song.title, song.artist);
  }

  /** Downloads the artwork at `url` (Apple Music's, Deezer's or Spotify's only), keeps it and makes it the song's image. */
  async setFromUrl(songVersionId: string, url: string, options: { onlyIfNone?: boolean } = {}): Promise<boolean> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException("Not an address");
    }
    if (!this.allowedHost(parsed)) throw new BadRequestException("Artwork comes from Apple Music, Deezer or Spotify only");
    const res = await fetch(parsed, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new BadRequestException(`Couldn't download the artwork (${res.status})`);
    if (!(res.headers.get("content-type") ?? "").startsWith("image/")) throw new BadRequestException("That isn't an image");
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_DOWNLOAD_BYTES) throw new BadRequestException("That image is too big");
    return this.store(songVersionId, body, parsed.toString(), options);
  }

  /** An image of the editor's own (issue #88), for songs Apple Music doesn't have: cropped square like the rest. */
  async setFromUpload(songVersionId: string, body: Buffer): Promise<void> {
    await this.store(songVersionId, body, "upload");
  }

  /** Makes `body` a square WebP, keeps it (content-addressed) and makes it the song's image. */
  private async store(songVersionId: string, body: Buffer, sourceUrl: string, options: { onlyIfNone?: boolean } = {}): Promise<boolean> {
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
      data: { imageStorageKey: hash, imageSourceUrl: sourceUrl },
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
   * compilation (issue #22) - from the first provider (in the admin's
   * order) with one. Says how it went (issue #93): "found"; "nomatch" when
   * the providers answered and none was close enough; "failed" when a
   * provider or the download failed, so it may be found next time;
   * "skipped" when artwork is off, no provider is asked for it, or the song
   * has an image. Never throws.
   */
  async autoFind(songVersionId: string): Promise<ArtworkOutcome> {
    try {
      if (!(await this.settings()).enabled) return "skipped";
      const song = await this.songForArtwork(songVersionId);
      if (song.hasImage) return "skipped";
      const title = fold(song.title);
      const artists = song.artists.map(fold).filter(Boolean);
      const year = (candidate: ArtworkCandidate) => candidate.releaseDate?.slice(0, 4) ?? "9999";
      const { candidates, failed, asked } = await this.metadata.artworkSearch(song.title, song.artist);
      if (asked === 0) return "skipped";
      const close = candidates.filter(
        (candidate) => fold(candidate.title) === title && (artists.length === 0 || artists.some((artist) => fold(candidate.artist).includes(artist) || artist.includes(fold(candidate.artist)))),
      );
      const provider = close[0]?.provider;
      const match = close.filter((candidate) => candidate.provider === provider).sort((a, b) => year(a).localeCompare(year(b)))[0];
      // A provider that failed might have had it.
      if (!match) return failed.length > 0 ? "failed" : "nomatch";
      return (await this.setFromUrl(songVersionId, match.artworkUrl, { onlyIfNone: true })) ? "found" : "skipped";
    } catch (err) {
      this.logger.warn(`No artwork for ${songVersionId}: ${err instanceof Error ? err.message : String(err)}`);
      return "failed";
    }
  }

  /**
   * Finds artwork for songs without an image, a few at a time (the providers
   * limit how fast they're asked). A song with no close match isn't tried
   * again; one whose lookup failed is, next time (issue #93).
   */
  async backfill(limit = 50): Promise<{ tried: number; found: number; failed: number }> {
    const songs = await this.prisma.client.songVersion.findMany({
      where: { imageStorageKey: null, imageSourceUrl: null },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    let found = 0;
    let failed = 0;
    for (const song of songs) {
      const outcome = await this.autoFind(song.id);
      if (outcome === "found") found++;
      else if (outcome === "failed") failed++;
      else if (outcome === "nomatch") await this.prisma.client.songVersion.updateMany({ where: { id: song.id, imageStorageKey: null }, data: { imageSourceUrl: "none" } });
      await new Promise((resolve) => setTimeout(resolve, process.env.ITUNES_SEARCH_URL ? 0 : 3000));
    }
    return { tried: songs.length, found, failed };
  }

  /** A song's image, resized: only with a valid key (checked by the caller's signature). */
  async image(songVersionId: string, storageKey: string, width: number): Promise<ProcessedImage> {
    const song = await this.prisma.client.songVersion.findUnique({ where: { id: songVersionId }, select: { imageStorageKey: true } });
    if (!song || song.imageStorageKey !== storageKey) throw new NotFoundException("No such image");
    return this.images.resize(storageKey, () => this.storage.get(storageKey), width);
  }

  private allowedHost(url: URL): boolean {
    const on = (domain: string) => url.hostname === domain || url.hostname.endsWith(`.${domain}`);
    if (url.protocol === "https:" && (on("mzstatic.com") || on("dzcdn.net") || on("scdn.co"))) return true;
    // The e2e suites' stand-ins serve their artwork too.
    return testOrigins().includes(url.origin);
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
