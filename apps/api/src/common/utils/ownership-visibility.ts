import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../types/authenticated-request";

export interface OwnedRecord {
  ownerScope: string; // "GLOBAL" | "TEAM" | "USER"
  ownerUserId: string | null;
  ownerTeamId: string | null;
}

/**
 * True if `user` owns a USER-scoped record, or belongs to the team that
 * owns a TEAM-scoped one. Global admins always pass. Callers handle the
 * GLOBAL case themselves - some entities (e.g. SongVersion) only treat
 * GLOBAL as visible once approved, while others (e.g. Songbook) treat it
 * as always visible, so that check doesn't belong in this shared helper.
 */
export async function isOwnedByOrMemberOf(
  prisma: PrismaService,
  user: AuthenticatedUser,
  record: OwnedRecord,
): Promise<boolean> {
  if (user.isGlobalAdmin) return true;
  if (record.ownerScope === "USER") return record.ownerUserId === user.id;
  if (record.ownerScope === "TEAM") {
    const membership = await prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId: record.ownerTeamId!, userId: user.id } },
    });
    return !!membership;
  }
  return false;
}
