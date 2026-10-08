import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { resolveScreenTheme } from "@songverse/core";
import type { Prisma } from "@songverse/db";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { redis } from "../jobs/redis.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SCREEN_CHANNEL } from "./screen-channel.js";

const THEME_SELECT = { id: true, name: true, document: true, ownerUserId: true, ownerTeamId: true, updatedAt: true, team: { select: { name: true } } } as const;
type ThemeRow = Prisma.ScreenThemeGetPayload<{ select: typeof THEME_SELECT }>;

/**
 * Screen themes (issue #194): a person's own, or a team's - its admins change
 * it, its members pick it for their screens. The document is kept as sent
 * (checked by ScreenThemeRequestSchema) and read through resolveScreenTheme.
 */
@Injectable()
export class ScreenThemesService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.prisma.client.screenTheme.delete({ where: { id: themeId } });
    for (const screen of screens) await redis().publish(SCREEN_CHANNEL, screen.id);
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
    updatedAt: theme.updatedAt.toISOString(),
  };
}
