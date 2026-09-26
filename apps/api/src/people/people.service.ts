import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@songverse/db";
import { AccessPolicyService } from "../access/access-policy.service";
import type { AuthenticatedUser } from "../common/types/authenticated-request";
import { PrismaService } from "../prisma/prisma.service";

const PERSON = { id: true, displayName: true, email: true, avatarUrl: true } satisfies Prisma.UserSelect;

/**
 * People (issue #77): the people a user is connected to, so they can share
 * songs with each other. A request goes to an email address; its owner
 * sees it once signed in (with that address) and accepts or declines. The
 * requester never learns whether the address has an account, or that
 * they were declined - their request just stays waiting.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  private async emailOf(userId: string): Promise<string> {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    return user.email.toLowerCase();
  }

  /** Requests to `user`: to their id once answered, or to their address while waiting. */
  private toMe(userId: string, email: string): Prisma.ConnectionWhereInput {
    return { OR: [{ addresseeId: userId }, { addresseeId: null, addresseeEmail: email }] };
  }

  /** The user's people, the requests waiting on them and on others, and people from their teams to ask. */
  async list(user: AuthenticatedUser) {
    const email = await this.emailOf(user.id);
    const [accepted, incoming, outgoing] = await Promise.all([
      this.prisma.client.connection.findMany({
        where: { status: "ACCEPTED", OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
        select: { id: true, requester: { select: PERSON }, addressee: { select: PERSON } },
        orderBy: { respondedAt: "desc" },
      }),
      this.prisma.client.connection.findMany({
        where: { status: "PENDING", requesterId: { not: user.id }, ...this.toMe(user.id, email) },
        select: { id: true, createdAt: true, requester: { select: PERSON } },
        orderBy: { createdAt: "desc" },
      }),
      // Declined ones look like they're still waiting: no one learns they were turned down.
      this.prisma.client.connection.findMany({
        where: { requesterId: user.id, status: { in: ["PENDING", "DECLINED"] } },
        select: { id: true, createdAt: true, addresseeEmail: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const people = accepted.map((c) => ({ connectionId: c.id, ...(c.requester.id === user.id ? c.addressee! : c.requester) }));
    const known = new Set([user.id, ...people.map((p) => p.id), ...incoming.map((c) => c.requester.id)]);
    const asked = new Set(outgoing.map((c) => c.addresseeEmail));
    const teammates = await this.prisma.client.user.findMany({
      where: { teamMemberships: { some: { team: { memberships: { some: { userId: user.id } } } } }, id: { notIn: [...known] } },
      select: { id: true, displayName: true, email: true, avatarUrl: true },
      orderBy: { displayName: "asc" },
      take: 50,
    });
    return {
      people,
      incoming: incoming.map((c) => ({ id: c.id, createdAt: c.createdAt, from: c.requester })),
      outgoing: outgoing.map(({ id, createdAt, addresseeEmail }) => ({ id, createdAt, email: addresseeEmail })),
      suggestions: teammates.filter((t) => !asked.has(t.email.toLowerCase())).map(({ id, displayName, avatarUrl }) => ({ id, displayName, avatarUrl })),
    };
  }

  /**
   * Asks someone to connect, by email or (someone from the user's teams)
   * by id. Asking someone who already asked the user connects them.
   */
  async request(user: AuthenticatedUser, input: { email?: string; userId?: string }) {
    let email = input.email?.toLowerCase();
    if (input.userId) {
      const shared = await this.prisma.client.teamMembership.count({
        where: { userId: input.userId, team: { memberships: { some: { userId: user.id } } } },
      });
      if (shared === 0) throw new NotFoundException("Not someone from your teams");
      email = await this.emailOf(input.userId);
    }
    if (!email) throw new BadRequestException("Give an email address");
    const mine = await this.emailOf(user.id);
    if (email === mine) throw new BadRequestException("That's your own address");

    // They asked first: that's a yes.
    const theirs = await this.prisma.client.connection.findFirst({
      where: { status: "PENDING", requester: { email: { equals: email, mode: "insensitive" } }, ...this.toMe(user.id, mine) },
      select: { id: true },
    });
    if (theirs) {
      await this.prisma.client.connection.update({ where: { id: theirs.id }, data: { status: "ACCEPTED", addresseeId: user.id, respondedAt: new Date() } });
      return { connected: true };
    }
    // Already connected, or already asked (a declined request stays as it is).
    await this.prisma.client.connection.upsert({
      where: { requesterId_addresseeEmail: { requesterId: user.id, addresseeEmail: email } },
      create: { requesterId: user.id, addresseeEmail: email },
      update: {},
    });
    return { connected: false };
  }

  async answer(user: AuthenticatedUser, id: string, accept: boolean) {
    const email = await this.emailOf(user.id);
    const request = await this.prisma.client.connection.findFirst({
      where: { id, status: "PENDING", requesterId: { not: user.id }, ...this.toMe(user.id, email) },
      select: { id: true },
    });
    if (!request) throw new NotFoundException("No such request");
    await this.prisma.client.connection.update({
      where: { id },
      data: { status: accept ? "ACCEPTED" : "DECLINED", addresseeId: user.id, respondedAt: new Date() },
    });
  }

  /** Takes back a request the user sent. */
  async cancel(user: AuthenticatedUser, id: string) {
    const { count } = await this.prisma.client.connection.deleteMany({ where: { id, requesterId: user.id, status: { not: "ACCEPTED" } } });
    if (count === 0) throw new NotFoundException("No such request");
  }

  /** Disconnects from someone: what either shared with the other stops being shared. */
  async remove(user: AuthenticatedUser, otherId: string) {
    const { count } = await this.prisma.client.connection.deleteMany({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: user.id, addresseeId: otherId },
          { requesterId: otherId, addresseeId: user.id },
        ],
      },
    });
    if (count === 0) throw new NotFoundException("Not one of your people");
    await this.prisma.client.accessGrant.deleteMany({
      where: {
        OR: [
          { grantedByUserId: user.id, grantedToUserId: otherId },
          { grantedByUserId: otherId, grantedToUserId: user.id },
        ],
      },
    });
  }

  async isConnected(a: string, b: string): Promise<boolean> {
    const count = await this.prisma.client.connection.count({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
    });
    return count > 0;
  }

  // --- sharing a song with someone

  /** Who a song is shared with (for who manages it). */
  async shares(songVersionId: string) {
    const grants = await this.prisma.client.accessGrant.findMany({
      where: { songVersionId, grantedToUserId: { not: null } },
      select: { canEdit: true, createdAt: true, grantedToUser: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    });
    return grants.map((g) => ({ user: g.grantedToUser!, canEdit: g.canEdit }));
  }

  /** Shares a personal or team song with one of the user's people, to view or edit. */
  async share(user: AuthenticatedUser, songVersionId: string, otherId: string, canEdit: boolean) {
    const song = await this.prisma.client.songVersion.findUniqueOrThrow({ where: { id: songVersionId }, select: { ownerScope: true, ownerUserId: true } });
    if (song.ownerScope === "GLOBAL") throw new BadRequestException("Everyone sees a catalogue song already");
    if (otherId === user.id || otherId === song.ownerUserId) throw new BadRequestException("It's already theirs");
    if (!(await this.isConnected(user.id, otherId))) throw new ForbiddenException("Share with one of your people");
    await this.prisma.client.accessGrant.upsert({
      where: { songVersionId_grantedToUserId: { songVersionId, grantedToUserId: otherId } },
      create: { songVersionId, grantedToUserId: otherId, grantedByUserId: user.id, canEdit },
      update: { canEdit },
    });
    return this.shares(songVersionId);
  }

  async unshare(songVersionId: string, otherId: string) {
    await this.prisma.client.accessGrant.deleteMany({ where: { songVersionId, grantedToUserId: otherId } });
    return this.shares(songVersionId);
  }

  /** Someone a song was shared with takes it out of their library. */
  async leave(user: AuthenticatedUser, songVersionId: string) {
    const { count } = await this.prisma.client.accessGrant.deleteMany({ where: { songVersionId, grantedToUserId: user.id } });
    if (count === 0) throw new NotFoundException("This song isn't shared with you");
  }

  /** Whether the user manages the song (owner, or admin of its team): who shares it. */
  async assertManages(user: AuthenticatedUser, songVersionId: string) {
    const song = await this.prisma.client.songVersion.findUnique({ where: { id: songVersionId }, select: { ownerScope: true, ownerUserId: true, ownerTeamId: true } });
    if (!song) throw new NotFoundException("Song version not found");
    await this.access.assertCanEdit(user, song, "song version");
  }
}
