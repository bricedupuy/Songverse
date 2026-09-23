import { BadRequestException, Injectable, UnsupportedMediaTypeException } from "@nestjs/common";
import sharp, { type Metadata } from "sharp";

export const AVATAR_MAX_SIZE = 512;

/**
 * Widths a resized image can be requested at; any other request snaps up to
 * the next one. A fixed set keeps the cache from being flooded with every
 * possible width and lets browsers/CDNs share cached responses.
 */
export const RESIZE_WIDTHS = [32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048] as const;
const MAX_RESIZE_WIDTH = 2048;

// Raster formats only: SVG (and PDF) would have the server render untrusted
// vector input.
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);
// ~50 megapixels (e.g. 8000x6000): guards against decompression bombs.
const LIMIT_INPUT_PIXELS = 50_000_000;
const CACHE_MAX_BYTES = 64 * 1024 * 1024;

export interface ProcessedImage {
  body: Buffer;
  contentType: string;
}

@Injectable()
export class ImageService {
  // Insertion-ordered Map as a small LRU of resized variants, keyed by
  // source content hash + width, so entries never go stale.
  private readonly cache = new Map<string, Buffer>();
  private cacheBytes = 0;

  /**
   * Square, at most 512x512, upright (EXIF orientation applied) and with
   * metadata such as GPS location stripped. Center-crops anything that isn't
   * already square, so clients that skip the crop step still get a square.
   */
  async normalizeAvatar(input: Buffer): Promise<ProcessedImage> {
    const { width, height } = await this.orientedSize(input);
    const side = Math.min(width, height, AVATAR_MAX_SIZE);
    const body = await this.pipeline(input)
      .resize({ width: side, height: side, fit: "cover", position: "centre" })
      .webp({ quality: 85 })
      .toBuffer();
    return { body, contentType: "image/webp" };
  }

  /** `requestedWidth` snaps up to the next RESIZE_WIDTHS entry; images are never enlarged. */
  async resize(sourceKey: string, loadSource: () => Promise<Buffer>, requestedWidth: number): Promise<ProcessedImage> {
    const width = snapWidth(requestedWidth);
    const cacheKey = `${sourceKey}:${width}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return { body: cached, contentType: "image/webp" };
    }

    const source = await loadSource();
    await this.orientedSize(source);
    const body = await this.pipeline(source).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    this.remember(cacheKey, body);
    return { body, contentType: "image/webp" };
  }

  private pipeline(input: Buffer) {
    return sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "error" }).rotate();
  }

  /** Validates the input is a supported raster image and returns its upright dimensions. */
  private async orientedSize(input: Buffer): Promise<{ width: number; height: number }> {
    let metadata: Metadata;
    try {
      metadata = await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
    } catch {
      throw new UnsupportedMediaTypeException("Not a supported image");
    }
    if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format) || !metadata.width || !metadata.height) {
      throw new UnsupportedMediaTypeException("Image must be JPEG, PNG, WebP, GIF, AVIF, HEIF or TIFF");
    }
    if (metadata.width * metadata.height > LIMIT_INPUT_PIXELS) {
      throw new UnsupportedMediaTypeException("Image dimensions are too large");
    }
    // EXIF orientations 5-8 rotate by 90 degrees, swapping width and height.
    const rotated = (metadata.orientation ?? 1) >= 5;
    return rotated ? { width: metadata.height, height: metadata.width } : { width: metadata.width, height: metadata.height };
  }

  private remember(key: string, body: Buffer): void {
    if (body.length > CACHE_MAX_BYTES / 4) return;
    this.cache.set(key, body);
    this.cacheBytes += body.length;
    for (const [oldestKey, oldest] of this.cache) {
      if (this.cacheBytes <= CACHE_MAX_BYTES) break;
      this.cache.delete(oldestKey);
      this.cacheBytes -= oldest.length;
    }
  }
}

export function snapWidth(requested: number): number {
  if (!Number.isFinite(requested) || requested < 1) {
    throw new BadRequestException(`Width must be a positive number (one of ${RESIZE_WIDTHS.join(", ")})`);
  }
  return RESIZE_WIDTHS.find((width) => width >= requested) ?? MAX_RESIZE_WIDTH;
}
