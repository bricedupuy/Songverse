import { BadRequestException, ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { SCREEN_CODE_ALPHABET, SCREEN_CODE_LENGTH, normalizeScreenCode, resolveScreenTheme, screenThemeTemplate, type ScreenMode, type ScreenTheme } from "@songverse/core";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { redis } from "../jobs/redis.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { capabilitiesOf } from "../roles/capabilities.js";
import { SetlistAccessService } from "../setlists/setlist-access.service.js";
import { SetlistsService } from "../setlists/setlists.service.js";

/** How long a pairing code waits to be confirmed. */
export const PAIRING_TTL_S = 10 * 60;
import { SCREEN_CHANNEL } from "./screen-channel.js";
import { presentScreenThemeAssets } from "./screen-theme-assets.js";
import { ScreenThemesService } from "./screen-themes.service.js";

export { SCREEN_CHANNEL };
const codeKey = (code: string) => `songverse:screen:code:${code}`;
const pairingKey = (id: string) => `songverse:screen:pairing:${id}`;

interface Pairing {
  code: string;
  secretHash: string;
  /** Set once someone's confirmed it, until the screen claims it. */
  token?: string;
  screenId?: string;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const SCREEN_SELECT = {
  id: true,
  name: true,
  mode: true,
  setlistId: true,
  themeId: true,
  themeTemplate: true,
  ownerUserId: true,
  lastSeenAt: true,
  createdAt: true,
  setlist: { select: { id: true, name: true, eventDate: true, eventDateOf: { select: { id: true } } } },
} as const;

/** A screen's look (issue #194), worked out: its theme, else its built-in one, else the default. */
function screenLook(screen: { themeTemplate: string | null; theme: { document: unknown } | null }): ScreenTheme {
  if (screen.theme) return resolveScreenTheme(screen.theme.document);
  return screenThemeTemplate(screen.themeTemplate)?.theme ?? resolveScreenTheme(null);
}

/** A screen's theme as asked for: one or the other (picking one clears the other); left out, as it was. */
function lookChange(change: { themeId?: string | null; themeTemplate?: string | null }) {
  if (change.themeId) return { themeId: change.themeId, themeTemplate: null };
  if (change.themeTemplate) return { themeId: null, themeTemplate: change.themeTemplate };
  return { ...(change.themeId === null && { themeId: null }), ...(change.themeTemplate === null && { themeTemplate: null }) };
}

/**
 * Screens (issue #186). A screen asks for a pairing code (no sign-in); someone
 * who leads a set confirms it from their phone, choosing the set and what's
 * shown; the screen, asking meanwhile, gets its own token: it reads that set
 * as the person who paired it would, and joins its sync session to follow
 * what's presented. Only a hash of the token is kept.
 */
@Injectable()
export class ScreensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SetlistAccessService,
    private readonly setlists: SetlistsService,
    private readonly themes: ScreenThemesService,
  ) {}

  /** A new code for a screen to show, and the secret it claims its token with. */
  async startPairing(): Promise<{ pairingId: string; code: string; secret: string; expiresAt: string }> {
    const pairingId = randomUUID();
    const secret = randomBytes(24).toString("base64url");
    for (let tries = 0; tries < 10; tries++) {
      const code = Array.from({ length: SCREEN_CODE_LENGTH }, () => SCREEN_CODE_ALPHABET[randomInt(SCREEN_CODE_ALPHABET.length)]).join("");
      // A code is someone else's until it expires.
      const taken = await redis().set(codeKey(code), pairingId, "EX", PAIRING_TTL_S, "NX");
      if (!taken) continue;
      const pairing: Pairing = { code, secretHash: hash(secret) };
      await redis().set(pairingKey(pairingId), JSON.stringify(pairing), "EX", PAIRING_TTL_S);
      return { pairingId, code, secret, expiresAt: new Date(Date.now() + PAIRING_TTL_S * 1000).toISOString() };
    }
    throw new Error("No pairing code free");
  }

  /** A code waiting to be confirmed, for the phone's page; 404 when it isn't (mistyped, expired, used). */
  async checkCode(input: string): Promise<{ code: string; expiresAt: string }> {
    const { code } = await this.waiting(input);
    const ttl = await redis().ttl(codeKey(code));
    return { code, expiresAt: new Date(Date.now() + Math.max(0, ttl) * 1000).toISOString() };
  }

  /** Confirmed by someone who leads `setlistId`: the screen's made, its token waiting for it to claim. */
  async confirm(user: AuthenticatedUser, input: string, change: { name: string; mode: ScreenMode; setlistId: string; themeId?: string | null; themeTemplate?: string | null }) {
    const { code, pairingId, pairing } = await this.waiting(input);
    await this.assertCanPresent(user, change.setlistId);
    if (change.themeId) await this.themes.assertCanUse(user, change.themeId);
    const token = `scr_${randomBytes(32).toString("base64url")}`;
    const screen = await this.prisma.client.screen.create({
      data: { name: change.name, mode: change.mode, setlistId: change.setlistId, ownerUserId: user.id, tokenHash: hash(token), ...lookChange(change) },
      select: SCREEN_SELECT,
    });
    const ttl = Math.max(30, await redis().ttl(pairingKey(pairingId)));
    await redis().set(pairingKey(pairingId), JSON.stringify({ ...pairing, token, screenId: screen.id } satisfies Pairing), "EX", ttl);
    // The code's done with: nobody else confirms it.
    await redis().del(codeKey(code));
    return present(screen);
  }

  /** The screen asking for its token: null until it's confirmed; 410 once it expired (or was claimed). */
  async claim(pairingId: string, secret: string): Promise<{ token: string; screen: ReturnType<typeof present> } | null> {
    const raw = typeof pairingId === "string" && pairingId.length <= 64 ? await redis().get(pairingKey(pairingId)) : null;
    if (!raw) throw new GoneException("This code has expired: show a new one");
    const pairing = JSON.parse(raw) as Pairing;
    const given = Buffer.from(hash(String(secret)));
    if (!timingSafeEqual(given, Buffer.from(pairing.secretHash))) throw new ForbiddenException("Not this screen's code");
    if (!pairing.token || !pairing.screenId) return null;
    await redis().del(pairingKey(pairingId));
    const screen = await this.prisma.client.screen.findUnique({ where: { id: pairing.screenId }, select: SCREEN_SELECT });
    if (!screen) throw new GoneException("This screen was disconnected");
    return { token: pairing.token, screen: present(screen) };
  }

  /** The screen a token signs in, or null. */
  async byToken(token: string) {
    if (typeof token !== "string" || !token.startsWith("scr_") || token.length > 100) return null;
    return this.prisma.client.screen.findUnique({ where: { tokenHash: hash(token) }, select: SCREEN_SELECT });
  }

  /** What a screen shows: itself, and its set as the person who paired it reads it (null without one, or when they no longer can). */
  async current(token: string) {
    const screen = await this.byToken(token);
    if (!screen) throw new NotFoundException("This screen was disconnected");
    const { theme } = await this.prisma.client.screen.update({
      where: { id: screen.id },
      data: { lastSeenAt: new Date() },
      select: { theme: { select: { document: true, assets: { select: { id: true, kind: true, storageKey: true, mimeType: true, filename: true } } } } },
    });
    const owner = await this.ownerOf(screen.ownerUserId);
    let set = null;
    if (owner && screen.setlistId) {
      try {
        const copy = await this.setlists.offlineCopy(owner, screen.setlistId);
        set = { ...copy, credits: await this.credits(copy.songs.flatMap((song) => (song.song ? [song.song.id] : []))) };
      } catch {
        // No longer theirs to read: the screen waits for another set.
      }
    }
    // Its theme's pictures, videos and fonts (issue #194), at addresses a screen can load without a session.
    return { screen: present(screen), theme: screenLook({ themeTemplate: screen.themeTemplate, theme }), assets: presentScreenThemeAssets(theme?.assets ?? []), set };
  }

  /** The screens of a set its leaders see, or the user's own. */
  async list(user: AuthenticatedUser, setlistId?: string) {
    if (setlistId) {
      await this.assertCanPresent(user, setlistId);
      return (await this.prisma.client.screen.findMany({ where: { setlistId }, select: SCREEN_SELECT, orderBy: { createdAt: "asc" } })).map(present);
    }
    return (await this.prisma.client.screen.findMany({ where: { ownerUserId: user.id }, select: SCREEN_SELECT, orderBy: { createdAt: "asc" } })).map(present);
  }

  async update(user: AuthenticatedUser, screenId: string, change: { name?: string; mode?: ScreenMode; setlistId?: string | null; themeId?: string | null; themeTemplate?: string | null }) {
    const screen = await this.changeable(user, screenId);
    if (change.setlistId) await this.assertCanPresent(user, change.setlistId);
    if (change.themeId) await this.themes.assertCanUse(user, change.themeId);
    const updated = await this.prisma.client.screen.update({
      where: { id: screen.id },
      data: {
        ...(change.name !== undefined && { name: change.name }),
        ...(change.mode !== undefined && { mode: change.mode }),
        ...(change.setlistId !== undefined && { setlistId: change.setlistId }),
        ...lookChange(change),
      },
      select: SCREEN_SELECT,
    });
    await redis().publish(SCREEN_CHANNEL, screen.id);
    return present(updated);
  }

  async remove(user: AuthenticatedUser, screenId: string): Promise<void> {
    const screen = await this.changeable(user, screenId);
    await this.prisma.client.screen.delete({ where: { id: screen.id } });
    await redis().publish(SCREEN_CHANNEL, screen.id);
  }

  /** Its pairer, a global admin, or someone who leads the set it shows. */
  private async changeable(user: AuthenticatedUser, screenId: string) {
    const screen = await this.prisma.client.screen.findUnique({ where: { id: screenId }, select: SCREEN_SELECT });
    if (!screen) throw new NotFoundException("Screen not found");
    if (screen.ownerUserId === user.id || user.isGlobalAdmin) return screen;
    if (screen.setlistId && (await this.canPresent(user, screen.setlistId))) return screen;
    throw new NotFoundException("Screen not found");
  }

  private async canPresent(user: AuthenticatedUser, setlistId: string): Promise<boolean> {
    const set = await this.prisma.client.setlist.findUnique({ where: { id: setlistId }, select: { id: true, ownerUserId: true, ownerTeamId: true } });
    return !!set && (await this.access.access(user, set)).canEdit;
  }

  /** Who leads the set - can edit it - shows it on screens (they lead its sync session too). */
  private async assertCanPresent(user: AuthenticatedUser, setlistId: string) {
    if (!(await this.canPresent(user, setlistId))) throw new ForbiddenException("Only someone who can edit the set shows it on a screen");
  }

  private async waiting(input: string): Promise<{ code: string; pairingId: string; pairing: Pairing }> {
    const code = normalizeScreenCode(String(input ?? ""));
    if (!code) throw new BadRequestException("code must be 6 letters and digits, as the screen shows it");
    const pairingId = await redis().get(codeKey(code));
    const raw = pairingId ? await redis().get(pairingKey(pairingId)) : null;
    if (!pairingId || !raw) throw new NotFoundException("No screen is showing this code: check it, or show a new one");
    return { code, pairingId, pairing: JSON.parse(raw) as Pairing };
  }

  private async ownerOf(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { id: true, email: true, isGlobalAdmin: true, bannedAt: true, deletedAt: true } });
    if (!user || user.bannedAt || user.deletedAt) return null;
    const { canReview } = await capabilitiesOf(this.prisma.client, user.id);
    return { id: user.id, email: user.email, isGlobalAdmin: user.isGlobalAdmin, isReviewer: canReview };
  }

  /** Each song's credits, for its first and last slides: who wrote it, its copyright and CCLI number. */
  private async credits(songVersionIds: string[]) {
    const songs = await this.prisma.client.songVersion.findMany({
      where: { id: { in: songVersionIds } },
      select: {
        id: true,
        copyright: true,
        copyrightYear: true,
        ccli: true,
        contributors: { where: { roles: { hasSome: ["AUTHOR", "COMPOSER", "LYRICIST", "TRANSLATOR", "ADAPTOR"] } }, orderBy: { displayOrder: "asc" }, select: { source: true, user: { select: { displayName: true } } } },
      },
    });
    return Object.fromEntries(
      songs.map((song) => [
        song.id,
        {
          writers: song.contributors.map((contributor) => contributor.source ?? contributor.user?.displayName ?? "").filter(Boolean),
          copyright: song.copyright ? `© ${song.copyrightYear ? `${song.copyrightYear} ` : ""}${song.copyright}` : null,
          ccli: song.ccli ?? null,
        },
      ]),
    );
  }
}

function present(screen: {
  id: string;
  name: string;
  mode: ScreenMode;
  setlistId: string | null;
  themeId: string | null;
  themeTemplate: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  setlist: { id: string; name: string | null; eventDate: Date | null; eventDateOf?: { id: string } | null } | null;
}) {
  return {
    id: screen.id,
    name: screen.name,
    mode: screen.mode,
    setlistId: screen.setlistId,
    setlist: screen.setlist ? { id: screen.setlist.id, name: screen.setlist.name, eventDate: screen.setlist.eventDate ? screen.setlist.eventDate.toISOString().slice(0, 10) : null, fromEvent: !!screen.setlist.eventDateOf } : null,
    lastSeenAt: screen.lastSeenAt?.toISOString() ?? null,
    createdAt: screen.createdAt.toISOString(),
    themeId: screen.themeId,
    themeTemplate: screen.themeTemplate,
  };
}
