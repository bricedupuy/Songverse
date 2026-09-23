import { createHash, randomBytes } from "node:crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { TransferUnavailableError, UserDeletionService } from "./user-deletion.service";

export const DEFAULT_TRANSFER_RETENTION_DAYS = 30;
export const MAX_TRANSFER_RETENTION_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * "Delete, but keep their content for someone": the account becomes
 * unusable immediately (signed out everywhere, no way to sign in, email
 * freed for re-registration), while its content stays put behind a
 * one-time link. The first signed-in user to open the link before it
 * expires takes ownership; otherwise the content is deleted with the
 * account once the link expires (see TransferExpiryProcessor).
 */
@Injectable()
export class ContentTransfersService {
  private readonly logger = new Logger(ContentTransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly userDeletion: UserDeletionService,
  ) {}

  async deleteAccountKeepingContent(userId: string, adminId: string, retentionDays: number) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + retentionDays * DAY_MS);

    await this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.contentTransfer.create({
        data: {
          tokenHash: hashToken(token),
          fromUserId: userId,
          fromDisplayName: user.displayName,
          fromEmail: user.email,
          createdByUserId: adminId,
          expiresAt,
        },
      });
      await this.userDeletion.handOverTeamAdminRoles(tx, userId);
      await tx.teamMembership.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.passkey.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        // The unique email is released so the person can sign up again.
        data: { deletedAt: new Date(), email: `deleted-${userId}@deleted.invalid`, emailVerified: false },
      });
    });

    return { transferUrl: this.urlFor(token), expiresAt };
  }

  /** Issues a new link for a pending transfer (only the hash is stored, so the old one can't be shown again). */
  async regenerateLink(userId: string) {
    const transfer = await this.prisma.client.contentTransfer.findUnique({ where: { fromUserId: userId } });
    if (!transfer) throw new NotFoundException("No pending transfer for this user");
    const token = randomBytes(32).toString("base64url");
    await this.prisma.client.contentTransfer.update({ where: { id: transfer.id }, data: { tokenHash: hashToken(token) } });
    return { transferUrl: this.urlFor(token), expiresAt: transfer.expiresAt };
  }

  async preview(token: string) {
    const transfer = await this.findValid(token);
    const owner = { ownerUserId: transfer.fromUserId };
    const [songCount, arrangementCount, songbookCount, tagCount, setCount, storage] = await Promise.all([
      this.prisma.client.songVersion.count({ where: owner }),
      this.prisma.client.arrangement.count({ where: owner }),
      this.prisma.client.songbook.count({ where: owner }),
      this.prisma.client.tag.count({ where: owner }),
      this.prisma.client.setlist.count({ where: owner }),
      this.prisma.client.attachment.aggregate({ where: { uploadedByUserId: transfer.fromUserId }, _sum: { sizeBytes: true } }),
    ]);
    return {
      fromDisplayName: transfer.fromDisplayName,
      expiresAt: transfer.expiresAt,
      songCount,
      arrangementCount,
      songbookCount,
      tagCount,
      setCount,
      storageBytes: storage._sum.sizeBytes ?? 0,
    };
  }

  async claim(token: string, claimantId: string): Promise<void> {
    const transfer = await this.findValid(token);
    try {
      await this.userDeletion.transferContentAndDeleteAccount(transfer.fromUserId, claimantId, {
        consumeTransferId: transfer.id,
      });
    } catch (error) {
      if (error instanceof TransferUnavailableError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Deletes accounts (and their content) whose transfer link expired unclaimed. */
  async purgeExpired(): Promise<number> {
    const expired = await this.prisma.client.contentTransfer.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { fromUserId: true },
    });
    for (const { fromUserId } of expired) {
      try {
        await this.userDeletion.deleteAccountAndContent(fromUserId);
      } catch (error) {
        this.logger.error(`Failed to purge expired transfer for user ${fromUserId}`, error as Error);
      }
    }
    return expired.length;
  }

  private async findValid(token: string) {
    const transfer = await this.prisma.client.contentTransfer.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!transfer || transfer.expiresAt <= new Date()) {
      throw new NotFoundException(new TransferUnavailableError().message);
    }
    return transfer;
  }

  private urlFor(token: string): string {
    const webUrl = this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    return `${new URL(webUrl).origin}/transfer/${token}`;
  }
}
