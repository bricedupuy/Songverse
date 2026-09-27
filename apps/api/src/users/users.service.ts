import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { orderInstruments, orderTechRoles } from "@songverse/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { ImageService } from "../images/image.service.js";
import { StorageQuotaService } from "../storage/storage-quota.service.js";
import { StorageService } from "../storage/storage.service.js";
import { detectAvatarImageType } from "./avatar-image.js";
import type { UpdateUserDto } from "./dto/update-user.dto.js";

const SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  locale: true,
  displayMode: true,
  capoDisplayMode: true,
  chordNotation: true,
  voicingPreference: true,
  isGlobalAdmin: true,
  isReviewer: true,
  instruments: true,
  techRoles: true,
} as const;

/** Stored roles no longer on the lists are dropped, the rest shown in list order. */
function toProfile<T extends { instruments: string[]; techRoles: string[] }>(user: T): T {
  return { ...user, instruments: orderInstruments(user.instruments), techRoles: orderTechRoles(user.techRoles) };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly quota: StorageQuotaService,
    private readonly images: ImageService,
  ) {}

  async findMe(userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: SELECT });
    if (!user) throw new NotFoundException("User not found");
    return toProfile(user);
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        locale: dto.locale,
        displayName: dto.displayName,
        capoDisplayMode: dto.capoDisplayMode,
        chordNotation: dto.chordNotation,
        instruments: dto.instruments && orderInstruments(dto.instruments),
        techRoles: dto.techRoles && orderTechRoles(dto.techRoles),
      },
      select: SELECT,
    });
    return toProfile(user);
  }

  getStorageUsage(userId: string) {
    return this.quota.getUsage(userId);
  }

  /**
   * Stored normalized (square, at most 512px, WebP, no metadata) whatever the
   * client sent. Avatars don't count toward the storage limit.
   */
  async setAvatar(userId: string, upload: Buffer) {
    const { body, contentType } = await this.images.normalizeAvatar(upload);
    const previous = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarStorageKey: true } });
    const { hash } = await this.storage.put(body, contentType);
    const user = await this.prisma.client.user.update({
      where: { id: userId },
      data: { avatarStorageKey: hash, avatarUrl: this.avatarUrlFor(userId, hash) },
      select: SELECT,
    });
    if (previous.avatarStorageKey && previous.avatarStorageKey !== hash) {
      await this.storage.deleteUnreferenced([previous.avatarStorageKey]);
    }
    return toProfile(user);
  }

  async removeAvatar(userId: string) {
    const previous = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarStorageKey: true } });
    const user = await this.prisma.client.user.update({
      where: { id: userId },
      data: { avatarStorageKey: null, avatarUrl: null },
      select: SELECT,
    });
    if (previous.avatarStorageKey) await this.storage.deleteUnreferenced([previous.avatarStorageKey]);
    return toProfile(user);
  }

  /**
   * Public, but only ever serves a user's *current* avatar: storage keys are
   * content hashes shared with attachments, so serving any key on request
   * would expose private files.
   */
  async getAvatar(userId: string, key: string, size?: number): Promise<{ body: Buffer; contentType: string }> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { avatarStorageKey: true, deletedAt: true },
    });
    if (!user || user.deletedAt || !user.avatarStorageKey || user.avatarStorageKey !== key) {
      throw new NotFoundException("Avatar not found");
    }
    if (size !== undefined) {
      return this.images.resize(key, () => this.storage.get(key), size);
    }
    const body = await this.storage.get(key);
    return { body, contentType: detectAvatarImageType(body) ?? "application/octet-stream" };
  }

  // Absolute, since the web app renders it from a different origin. The key
  // in the path changes with every new image, so it can be cached forever.
  private avatarUrlFor(userId: string, key: string): string {
    const apiOrigin = new URL(this.config.get<string>("AUTH_URL") ?? "http://localhost:3001").origin;
    return `${apiOrigin}/users/${userId}/avatar/${key}`;
  }
}
