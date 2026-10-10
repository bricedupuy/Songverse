import { randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SetlistAccessService } from "./setlist-access.service.js";
import { summarize } from "./setlists.service.js";

/**
 * Sharing a set by link. Its editors (the owner, or a team set's admins) can
 * turn on one link per set; anyone signed in who opens it joins as a guest:
 * they can open the set and read every song in it, and keep private notes,
 * but not change it. Resetting the link stops the old one from working;
 * guests who already joined stay until removed or they leave.
 */
@Injectable()
export class SetlistSharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sets: SetlistAccessService,
  ) {}

  async sharing(user: AuthenticatedUser, setlistId: string) {
    await this.sets.findEditable(user, setlistId);
    const [link, guests] = await Promise.all([
      this.prisma.client.setlistShareLink.findUnique({ where: { setlistId }, select: { token: true, createdAt: true } }),
      this.prisma.client.setlistGuest.findMany({
        where: { setlistId },
        orderBy: { joinedAt: "asc" },
        select: { joinedAt: true, user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
      }),
    ]);
    return {
      link,
      guests: guests.map(({ joinedAt, user: guest }) => ({
        userId: guest.id,
        displayName: guest.displayName,
        email: guest.email,
        avatarUrl: guest.avatarUrl,
        joinedAt,
      })),
    };
  }

  /** Turns the link on, or replaces it with a new one (the old one stops working). */
  async resetLink(user: AuthenticatedUser, setlistId: string) {
    await this.sets.findEditable(user, setlistId);
    const token = randomBytes(18).toString("base64url");
    await this.prisma.client.setlistShareLink.upsert({
      where: { setlistId },
      create: { setlistId, token },
      update: { token, createdAt: new Date() },
    });
    return this.sharing(user, setlistId);
  }

  async removeLink(user: AuthenticatedUser, setlistId: string) {
    await this.sets.findEditable(user, setlistId);
    await this.prisma.client.setlistShareLink.deleteMany({ where: { setlistId } });
    return this.sharing(user, setlistId);
  }

  async removeGuest(user: AuthenticatedUser, setlistId: string, guestUserId: string) {
    await this.sets.findEditable(user, setlistId);
    await this.prisma.client.setlistGuest.deleteMany({ where: { setlistId, userId: guestUserId } });
    return this.sharing(user, setlistId);
  }

  async leave(user: AuthenticatedUser, setlistId: string): Promise<void> {
    const { count } = await this.prisma.client.setlistGuest.deleteMany({ where: { setlistId, userId: user.id } });
    if (count === 0) throw new NotFoundException("You're not a guest of this set");
  }

  /** What the link leads to, shown before signing in to accept it. */
  async preview(token: string) {
    const link = await this.prisma.client.setlistShareLink.findUnique({
      where: { token },
      select: {
        setlist: {
          include: {
            ownerTeam: { select: { name: true } },
            ownerUser: { select: { displayName: true } },
            eventDateOf: { select: { id: true } },
            _count: { select: { items: true } },
          },
        },
      },
    });
    if (!link) throw new NotFoundException("This link doesn't work any more. Ask for a new one.");
    const { name, eventDate, teamName, ownerName, fromEvent } = summarize(link.setlist);
    return { name, eventDate, teamName, ownerName, fromEvent, itemCount: link.setlist._count.items };
  }

  /** Joins the set as a guest - or, for someone who can already open it, just says where it is. */
  async join(user: AuthenticatedUser, token: string): Promise<{ setlistId: string }> {
    const link = await this.prisma.client.setlistShareLink.findUnique({
      where: { token },
      select: { setlist: { select: { id: true, ownerUserId: true, ownerTeamId: true } } },
    });
    if (!link) throw new NotFoundException("This link doesn't work any more. Ask for a new one.");
    const { setlist } = link;
    const access = await this.sets.access(user, setlist);
    if (!access.canView) {
      await this.prisma.client.setlistGuest.upsert({
        where: { setlistId_userId: { setlistId: setlist.id, userId: user.id } },
        create: { setlistId: setlist.id, userId: user.id },
        update: {},
      });
    }
    return { setlistId: setlist.id };
  }
}
