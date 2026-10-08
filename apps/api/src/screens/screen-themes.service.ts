import { BadRequestException, ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { resolveScreenTheme, type ScreenThemeAssetKind } from "@songverse/core";
import type { Request, Response } from "express";
import type { Prisma } from "@songverse/db";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { redis } from "../jobs/redis.js";
import { sendFile } from "../files/send-file.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageQuotaService } from "../storage/storage-quota.service.js";
import { StorageService } from "../storage/storage.service.js";
import { isValidScreenThemeAssetSignature, presentScreenThemeAssets, screenThemeAssetType } from "./screen-theme-assets.js";
import { SCREEN_CHANNEL } from "./screen-channel.js";

const ASSET_SELECT = { id: true, kind: true, storageKey: true, mimeType: true, filename: true } as const;
const THEME_SELECT = {
  id: true,
  name: true,
  document: true,
  ownerUserId: true,
  ownerTeamId: true,
  updatedAt: true,
  team: { select: { name: true } },
  assets: { select: ASSET_SELECT, orderBy: { createdAt: "asc" } },
} as const;
type ThemeRow = Prisma.ScreenThemeGetPayload<{ select: typeof THEME_SELECT }>;

/**
 * Screen themes (issue #194): a person's own, or a team's - its admins change
 * it, its members pick it for their screens. The document is kept as sent
 * (checked by ScreenThemeRequestSchema) and read through resolveScreenTheme.
 */
@Injectable()
export class ScreenThemesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly quota: StorageQuotaService,
  ) {}

  /** Theirs and their teams'. */
  async list(user: AuthenticatedUser) {
    const memberships = await this.prisma.client.teamMembership.findMany({ where: { userId: user.id }, select: { teamId: true, role: true } });
    const themes = await this.prisma.client.screenTheme.findMany({
      where: { OR: [{ ownerUserId: user.id }, { ownerTeamId: { in: memberships.map((one) => one.teamId) } }] },
      select: THEME_SELECT,
      orderBy: [{ name: "asc" }],
    });
    const admin = new Set(memberships.filter((one) => one.role === "ADMIN").map((one) => one.teamId));
    return themes.map((theme) => present(theme, theme.ownerUserId === user.id || (!!theme.ownerTeamId && admin.has(theme.ownerTeamId))));
  }

  async create(user: AuthenticatedUser, data: { name: string; teamId?: string; theme: unknown }) {
    if (data.teamId) await this.assertTeamAdmin(user, data.teamId);
    const theme = await this.prisma.client.screenTheme.create({
      data: { name: data.name, document: data.theme as Prisma.InputJsonValue, ...(data.teamId ? { ownerTeamId: data.teamId } : { ownerUserId: user.id }) },
      select: THEME_SELECT,
    });
    return present(theme, true);
  }

  /** Changed: the screens showing it change at once. */
  async update(user: AuthenticatedUser, themeId: string, data: { name?: string; theme?: unknown }) {
    await this.changeable(user, themeId);
    const theme = await this.prisma.client.screenTheme.update({
      where: { id: themeId },
      data: { ...(data.name !== undefined && { name: data.name }), ...(data.theme !== undefined && { document: data.theme as Prisma.InputJsonValue }) },
      select: THEME_SELECT,
    });
    await this.announce(themeId);
    return present(theme, true);
  }

  /** Deleted: its screens go back to the default look. */
  async remove(user: AuthenticatedUser, themeId: string): Promise<void> {
    await this.changeable(user, themeId);
    const screens = await this.prisma.client.screen.findMany({ where: { themeId }, select: { id: true } });
    const assets = await this.prisma.client.screenThemeAsset.findMany({ where: { themeId }, select: { storageKey: true } });
    await this.prisma.client.screenTheme.delete({ where: { id: themeId } });
    await this.storage.deleteUnreferenced(assets.map((asset) => asset.storageKey));
    for (const screen of screens) await redis().publish(SCREEN_CHANNEL, screen.id);
  }

  /**
   * A theme's own file (issue #194): a background picture or looping video,
   * or a font. Counts against the uploader's storage; the theme's document
   * then refers to it by id (background.media, text.customFont).
   */
  async addAsset(user: AuthenticatedUser, themeId: string, kind: ScreenThemeAssetKind, file: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
    await this.changeable(user, themeId);
    const type = screenThemeAssetType(kind, file.mimetype, file.originalname);
    if (!type) throw new BadRequestException(kind === "font" ? "A font is a WOFF2, WOFF, TTF or OTF file" : "A picture (JPEG, PNG, WebP, AVIF, GIF) or a video (MP4, WebM)");
    if (file.size > type.limit) throw new PayloadTooLargeException(`This file is over ${Math.round(type.limit / 1024 / 1024)} MB`);
    await this.quota.assertCanStore(user.id, file.size);
    const stored = await this.storage.put(file.buffer, type.mimeType);
    const asset = await this.prisma.client.screenThemeAsset.create({
      data: { themeId, kind, storageKey: stored.hash, mimeType: type.mimeType, filename: file.originalname.slice(0, 200), sizeBytes: stored.sizeBytes },
      select: ASSET_SELECT,
    });
    return presentScreenThemeAssets([asset])[0]!;
  }

  /** Removed: a theme still pointing at it shows its colours instead. */
  async removeAsset(user: AuthenticatedUser, themeId: string, assetId: string): Promise<void> {
    await this.changeable(user, themeId);
    const asset = await this.prisma.client.screenThemeAsset.findFirst({ where: { id: assetId, themeId }, select: { storageKey: true } });
    if (!asset) throw new NotFoundException("File not found");
    await this.prisma.client.screenThemeAsset.delete({ where: { id: assetId } });
    await this.storage.deleteUnreferenced([asset.storageKey]);
    await this.announce(themeId);
  }

  /** A theme's file at its signed address: for a screen, which has no session. */
  async sendAsset(assetId: string, expires: string | undefined, signature: string | undefined, req: Request, res: Response): Promise<void> {
    const asset = await this.prisma.client.screenThemeAsset.findUnique({ where: { id: assetId }, select: { storageKey: true, mimeType: true, filename: true, sizeBytes: true } });
    if (!asset || !isValidScreenThemeAssetSignature(assetId, asset.storageKey, expires, signature)) throw new ForbiddenException("This address has expired");
    await sendFile(this.storage, asset, req, res, "inline");
  }

  /** A theme the user may put on a screen: theirs or one of their teams'. */
  async assertCanUse(user: AuthenticatedUser, themeId: string) {
    const theme = await this.prisma.client.screenTheme.findUnique({ where: { id: themeId }, select: { ownerUserId: true, ownerTeamId: true } });
    if (theme && (theme.ownerUserId === user.id || (theme.ownerTeamId && (await this.member(user.id, theme.ownerTeamId))))) return;
    throw new NotFoundException("Screen theme not found");
  }

  private async announce(themeId: string) {
    const screens = await this.prisma.client.screen.findMany({ where: { themeId }, select: { id: true } });
    for (const screen of screens) await redis().publish(SCREEN_CHANNEL, screen.id);
  }

  private async changeable(user: AuthenticatedUser, themeId: string) {
    const theme = await this.prisma.client.screenTheme.findUnique({ where: { id: themeId }, select: { ownerUserId: true, ownerTeamId: true } });
    if (!theme) throw new NotFoundException("Screen theme not found");
    if (theme.ownerUserId === user.id || user.isGlobalAdmin) return theme;
    if (theme.ownerTeamId && (await this.member(user.id, theme.ownerTeamId)) === "ADMIN") return theme;
    // A team's members see it, but only its admins change it.
    if (theme.ownerTeamId && (await this.member(user.id, theme.ownerTeamId))) throw new ForbiddenException("Only the team's admins change its screen themes");
    throw new NotFoundException("Screen theme not found");
  }

  private async assertTeamAdmin(user: AuthenticatedUser, teamId: string) {
    if ((await this.member(user.id, teamId)) !== "ADMIN") throw new ForbiddenException("Only the team's admins add screen themes for it");
  }

  private async member(userId: string, teamId: string): Promise<"ADMIN" | "MEMBER" | null> {
    const membership = await this.prisma.client.teamMembership.findFirst({ where: { userId, teamId }, select: { role: true } });
    return membership?.role ?? null;
  }
}

function present(theme: ThemeRow, canEdit: boolean) {
  return {
    id: theme.id,
    name: theme.name,
    theme: resolveScreenTheme(theme.document),
    ownerUserId: theme.ownerUserId,
    ownerTeamId: theme.ownerTeamId,
    teamName: theme.team?.name ?? null,
    canEdit,
    assets: presentScreenThemeAssets(theme.assets),
    updatedAt: theme.updatedAt.toISOString(),
  };
}
