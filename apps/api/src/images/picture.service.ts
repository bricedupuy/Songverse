import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import { detectAvatarImageType } from "../users/avatar-image.js";
import { ImageService } from "./image.service.js";

/** Whose picture: a team's or a songbook's - the path the API serves it under. */
export type PictureOwner = "teams" | "songbooks";

/**
 * A team's or a songbook's picture (issue #161), kept as a user's avatar
 * is: normalised (square, WebP, no metadata), stored content-addressed, not
 * counted against storage, and served at an address with its key in it, so
 * it can be cached forever and only the current one is ever served.
 */
@Injectable()
export class PictureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly images: ImageService,
    private readonly config: ConfigService,
  ) {}

  async set(owner: PictureOwner, id: string, upload: Buffer): Promise<{ avatarUrl: string }> {
    const { body, contentType } = await this.images.normalizeAvatar(upload);
    const previous = await this.currentKey(owner, id);
    const { hash } = await this.storage.put(body, contentType);
    const avatarUrl = this.urlFor(owner, id, hash);
    await this.write(owner, id, { avatarStorageKey: hash, avatarUrl });
    if (previous && previous !== hash) await this.storage.deleteUnreferenced([previous]);
    return { avatarUrl };
  }

  async remove(owner: PictureOwner, id: string): Promise<void> {
    const previous = await this.currentKey(owner, id);
    await this.write(owner, id, { avatarStorageKey: null, avatarUrl: null });
    if (previous) await this.storage.deleteUnreferenced([previous]);
  }

  /** Only its current picture: keys are content hashes shared with private files. */
  async get(owner: PictureOwner, id: string, key: string, size?: number): Promise<{ body: Buffer; contentType: string }> {
    if ((await this.currentKey(owner, id)) !== key) throw new NotFoundException("Picture not found");
    if (size !== undefined && Number.isFinite(size)) return this.images.resize(key, () => this.storage.get(key), size);
    const body = await this.storage.get(key);
    return { body, contentType: detectAvatarImageType(body) ?? "application/octet-stream" };
  }

  private async currentKey(owner: PictureOwner, id: string): Promise<string | null> {
    const row =
      owner === "teams"
        ? await this.prisma.client.team.findUnique({ where: { id }, select: { avatarStorageKey: true } })
        : await this.prisma.client.songbook.findUnique({ where: { id }, select: { avatarStorageKey: true } });
    if (!row) throw new NotFoundException(owner === "teams" ? "Team not found" : "Songbook not found");
    return row.avatarStorageKey;
  }

  private async write(owner: PictureOwner, id: string, data: { avatarStorageKey: string | null; avatarUrl: string | null }) {
    if (owner === "teams") await this.prisma.client.team.update({ where: { id }, data });
    else await this.prisma.client.songbook.update({ where: { id }, data });
  }

  // Absolute: the web app shows it from another origin.
  private urlFor(owner: PictureOwner, id: string, key: string): string {
    const apiOrigin = new URL(this.config.get<string>("AUTH_URL") ?? "http://localhost:3001").origin;
    return `${apiOrigin}/${owner}/${id}/avatar/${key}`;
  }
}
