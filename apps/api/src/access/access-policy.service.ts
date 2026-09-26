import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@songverse/db";
import { PrismaService } from "../prisma/prisma.service";

/** Who's asking: enough of a user to decide what they can see and change. */
export interface Viewer {
  id: string;
  isGlobalAdmin: boolean;
  isReviewer?: boolean;
}

/** Anything owned by a user, a team, or everyone (GLOBAL). */
export interface OwnedRecord {
  ownerScope: string;
  ownerUserId: string | null;
  ownerTeamId: string | null;
}

type OwnedSong = OwnedRecord & { publicationState: string };

/** A submission to the global catalogue that's still waiting on someone. */
export const OPEN_SUBMISSION_STATES = ["SUBMITTED", "UNDER_REVIEW", "NEEDS_CHANGES"] as const;

/**
 * The access rules, in one place. Every guard and service asks here
 * rather than restating them (each rule also comes as a database filter,
 * for lists, and as a yes/no, for one record):
 *
 * - Songs: anyone sees approved global songs (global admins, every global
 *   song), a user's own songs, their teams' songs, and songs shared with
 *   them (AccessGrant, issue #77). Reviewers can also open a song while
 *   it's submitted to the global catalogue.
 * - Songbooks: anyone sees global songbooks, plus their own and their teams'.
 * - Tags: approved global tags, the user's own, and their teams'.
 * - Arrangements: the user's own and their teams' (of songs they can see;
 *   through a set, anyone who can open the set sees the one it plays).
 * - Changing a song, songbook or arrangement: its owner for a personal one, the team's
 *   admins for a team one, and only global admins for a global one. Global
 *   admins can change anything. Someone a song is shared with to edit
 *   changes its chart, details and credits (canEditContent), not the rest
 *   (deleting, publishing, sharing it…).
 */
@Injectable()
export class AccessPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /** The teams the user belongs to. */
  async teamIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.client.teamMembership.findMany({ where: { userId }, select: { teamId: true } });
    return memberships.map((m) => m.teamId);
  }

  /** The user's role in a team, or null when they're not in it. */
  async teamRole(userId: string, teamId: string): Promise<"ADMIN" | "MEMBER" | null> {
    const membership = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }

  /** Songs `viewer` can see, given the teams they're in. */
  songsVisibleWhere(viewer: Viewer, teamIds: string[]): Prisma.SongVersionWhereInput {
    return {
      OR: [
        viewer.isGlobalAdmin ? { ownerScope: "GLOBAL" } : { ownerScope: "GLOBAL", publicationState: "APPROVED" },
        { ownerScope: "USER", ownerUserId: viewer.id },
        { ownerScope: "TEAM", ownerTeamId: { in: teamIds } },
        { ownerScope: { not: "GLOBAL" }, accessGrants: { some: { grantedToUserId: viewer.id } } },
      ],
    };
  }

  /** The songs shared with the user (issue #77): which, and whether to edit. */
  async sharedWith(userId: string): Promise<Map<string, { canEdit: boolean }>> {
    const grants = await this.prisma.client.accessGrant.findMany({ where: { grantedToUserId: userId }, select: { songVersionId: true, canEdit: true } });
    return new Map(grants.map((grant) => [grant.songVersionId, { canEdit: grant.canEdit }]));
  }

  /** Songs `viewer` can see. */
  async songsVisibleTo(viewer: Viewer): Promise<Prisma.SongVersionWhereInput> {
    return this.songsVisibleWhere(viewer, await this.teamIds(viewer.id));
  }

  async canSeeSong(viewer: Viewer, song: OwnedSong & { id?: string }): Promise<boolean> {
    if (song.ownerScope === "GLOBAL") return viewer.isGlobalAdmin || song.publicationState === "APPROVED";
    if (await this.ownsOrBelongsTo(viewer, song)) return true;
    if (song.id && (await this.prisma.client.accessGrant.count({ where: { songVersionId: song.id, grantedToUserId: viewer.id } })) > 0) return true;
    return !!viewer.isReviewer && !!song.id && (await this.isAwaitingReview(song.id));
  }

  /**
   * Whether `viewer` may change the song's chart, details and credits: who
   * can edit it (canEdit), or someone it's shared with to edit (#77).
   */
  async canEditContent(viewer: Viewer, song: OwnedRecord & { id: string }): Promise<boolean> {
    if (await this.canEdit(viewer, song)) return true;
    if (song.ownerScope === "GLOBAL") return false;
    return (await this.prisma.client.accessGrant.count({ where: { songVersionId: song.id, grantedToUserId: viewer.id, canEdit: true } })) > 0;
  }

  /** Whether the song has a submission to the global catalogue still open. */
  async isAwaitingReview(songVersionId: string): Promise<boolean> {
    const open = await this.prisma.client.submission.count({
      where: { songVersionId, state: { in: [...OPEN_SUBMISSION_STATES] } },
    });
    return open > 0;
  }

  /** canSeeSong for many songs at once, given the viewer's teams (see teamIds) and the songs shared with them (see sharedWith). */
  songVisibleGivenTeams(viewer: Viewer, teamIds: ReadonlySet<string>, song: OwnedSong & { id?: string }, shared: ReadonlyMap<string, unknown> = new Map()): boolean {
    if (viewer.isGlobalAdmin) return true;
    if (song.ownerScope === "GLOBAL") return song.publicationState === "APPROVED";
    if (song.id && shared.has(song.id)) return true;
    if (song.ownerScope === "USER") return song.ownerUserId === viewer.id;
    return !!song.ownerTeamId && teamIds.has(song.ownerTeamId);
  }

  /** Throws unless the song exists and `viewer` can see it. */
  async assertCanSeeSong(viewer: Viewer, songVersionId: string): Promise<void> {
    const song = await this.prisma.client.songVersion.findUnique({
      where: { id: songVersionId },
      select: { id: true, ownerScope: true, ownerUserId: true, ownerTeamId: true, publicationState: true },
    });
    if (!song) throw new NotFoundException("Song version not found");
    if (!(await this.canSeeSong(viewer, song))) throw new ForbiddenException("Not visible to you");
  }

  /** Songbooks `viewer` can see (a global admin, all of them). */
  async songbooksVisibleTo(viewer: Viewer): Promise<Prisma.SongbookWhereInput> {
    if (viewer.isGlobalAdmin) return {};
    return {
      OR: [
        { ownerScope: "GLOBAL" },
        { ownerScope: "USER", ownerUserId: viewer.id },
        { ownerScope: "TEAM", ownerTeamId: { in: await this.teamIds(viewer.id) } },
      ],
    };
  }

  async canSeeSongbook(viewer: Viewer, songbook: OwnedRecord): Promise<boolean> {
    return songbook.ownerScope === "GLOBAL" || this.ownsOrBelongsTo(viewer, songbook);
  }

  /** Arrangements `viewer` can see (their own and their teams'), of a song they can see. */
  async arrangementsVisibleTo(viewer: Viewer): Promise<Prisma.ArrangementWhereInput> {
    if (viewer.isGlobalAdmin) return {};
    return {
      OR: [
        { ownerScope: "USER", ownerUserId: viewer.id },
        { ownerScope: "TEAM", ownerTeamId: { in: await this.teamIds(viewer.id) } },
      ],
    };
  }

  async canSeeArrangement(viewer: Viewer, arrangement: OwnedRecord): Promise<boolean> {
    return this.ownsOrBelongsTo(viewer, arrangement);
  }

  /** Tags `viewer` can use. */
  async tagsVisibleTo(viewer: Pick<Viewer, "id">): Promise<Prisma.TagWhereInput> {
    return {
      OR: [
        { scope: "GLOBAL", isApproved: true },
        { scope: "USER", ownerUserId: viewer.id },
        { scope: "TEAM", ownerTeamId: { in: await this.teamIds(viewer.id) } },
      ],
    };
  }

  /** Whether `viewer` can change a song, songbook or arrangement (see the class comment). */
  async canEdit(viewer: Viewer, record: OwnedRecord): Promise<boolean> {
    if (viewer.isGlobalAdmin) return true;
    if (record.ownerScope === "USER") return record.ownerUserId === viewer.id;
    if (record.ownerScope === "TEAM" && record.ownerTeamId) return (await this.teamRole(viewer.id, record.ownerTeamId)) === "ADMIN";
    return false;
  }

  /** Throws the reason `viewer` can't change `record` (a "song version", a "songbook"), if they can't. */
  async assertCanEdit(viewer: Viewer, record: OwnedRecord, noun: string): Promise<void> {
    if (await this.canEdit(viewer, record)) return;
    if (record.ownerScope === "GLOBAL") throw new ForbiddenException(`Only global admins can edit a global ${noun}`);
    if (record.ownerScope === "USER") throw new ForbiddenException(`Not the owner of this ${noun}`);
    throw new ForbiddenException(`Team admin role required to edit this ${noun}`);
  }

  /** The owner, or anyone in the owning team (global admins count as both). */
  private async ownsOrBelongsTo(viewer: Viewer, record: OwnedRecord): Promise<boolean> {
    if (viewer.isGlobalAdmin) return true;
    if (record.ownerScope === "USER") return record.ownerUserId === viewer.id;
    if (record.ownerScope === "TEAM" && record.ownerTeamId) return (await this.teamRole(viewer.id, record.ownerTeamId)) !== null;
    return false;
  }
}
