import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageQuotaService } from "../storage/storage-quota.service.js";
import { ContentTransfersService } from "./content-transfers.service.js";
import { UserDeletionService } from "./user-deletion.service.js";

export interface UpdateUserInput {
  /** Null clears the override (back to the default limit). */
  storageLimitMb?: number | null;
  banned?: boolean;
  banReason?: string;
  isReviewer?: boolean;
}

export type DeleteContentAction = "delete" | "transfer";

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: StorageQuotaService,
    private readonly transfers: ContentTransfersService,
    private readonly userDeletion: UserDeletionService,
  ) {}

  async list() {
    const [users, usedBytes, { limitMb: defaultLimitMb }] = await Promise.all([
      this.prisma.client.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          emailVerified: true,
          isGlobalAdmin: true,
          isReviewer: true,
          createdAt: true,
          bannedAt: true,
          banReason: true,
          deletedAt: true,
          storageLimitMb: true,
          contentTransfer: { select: { fromEmail: true, expiresAt: true } },
          _count: { select: { teamMemberships: true, ownedVersions: true } },
        },
      }),
      this.quota.usedBytesByUser(),
      this.quota.getDefaultLimitMb(),
    ]);

    return users.map((user) => ({
      id: user.id,
      // A deleted account's email was released; show the one it had.
      email: user.contentTransfer?.fromEmail ?? user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      isGlobalAdmin: user.isGlobalAdmin,
      isReviewer: user.isReviewer,
      createdAt: user.createdAt,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      deletedAt: user.deletedAt,
      transferExpiresAt: user.contentTransfer?.expiresAt ?? null,
      storageLimitMb: user.storageLimitMb,
      usedBytes: usedBytes.get(user.id) ?? 0,
      limitBytes: this.quota.limitBytesFor(user, defaultLimitMb),
      teamCount: user._count.teamMemberships,
      songCount: user._count.ownedVersions,
    }));
  }

  async update(adminId: string, userId: string, input: UpdateUserInput): Promise<void> {
    const user = await this.findActive(userId);
    if (input.banned !== undefined && userId === adminId) {
      throw new ForbiddenException("You can't ban yourself");
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          ...(input.storageLimitMb !== undefined && { storageLimitMb: input.storageLimitMb }),
          ...(input.banned === true && { bannedAt: new Date(), banReason: input.banReason?.trim() || null }),
          ...(input.banned === false && { bannedAt: null, banReason: null }),
          ...(input.isReviewer !== undefined && { isReviewer: input.isReviewer }),
        },
      });
      if (input.banned === true) {
        await tx.session.deleteMany({ where: { userId } });
      }
    });
  }

  async remove(adminId: string, userId: string, action: DeleteContentAction, retentionDays: number) {
    if (userId === adminId) throw new ForbiddenException("You can't delete your own account here");

    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
    if (!user) throw new NotFoundException("User not found");

    // An account already awaiting transfer can only be finished off.
    if (user.deletedAt && action === "transfer") {
      throw new BadRequestException("This account already has a pending transfer link");
    }

    if (action === "transfer") {
      return this.transfers.deleteAccountKeepingContent(userId, adminId, retentionDays);
    }
    await this.userDeletion.deleteAccountAndContent(userId);
    return null;
  }

  regenerateTransferLink(userId: string) {
    return this.transfers.regenerateLink(userId);
  }

  private async findActive(userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { id: true, deletedAt: true } });
    if (!user || user.deletedAt) throw new NotFoundException("User not found");
    return user;
  }
}
