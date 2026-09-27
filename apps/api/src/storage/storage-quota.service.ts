import { Injectable, PayloadTooLargeException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/** Used when neither the user nor Admin > Storage sets a limit. */
export const BUILT_IN_DEFAULT_USER_STORAGE_LIMIT_MB = 50;

const BYTES_PER_MB = 1024 * 1024;
const SINGLETON_ID = "singleton";

export interface StorageUsage {
  usedBytes: number;
  /** Null means unlimited (global admins). */
  limitBytes: number | null;
}

/**
 * Per-user storage limits. Usage is the sum of every attachment a user
 * uploaded (Attachment.uploadedByUserId), counted logically: two users
 * uploading the same file each pay for it, even though content-addressed
 * storage keeps one copy. Avatars don't count.
 *
 * Global admins aren't limited - they bulk-upload whole published
 * catalogs, which would blow through any per-user cap.
 */
@Injectable()
export class StorageQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolved fresh on every call, like the rest of Admin > Storage. */
  async getDefaultLimitMb(): Promise<{ limitMb: number; isBuiltIn: boolean }> {
    const settings = await this.prisma.client.storageSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { defaultUserStorageLimitMb: true },
    });
    const configured = settings?.defaultUserStorageLimitMb;
    return configured == null
      ? { limitMb: BUILT_IN_DEFAULT_USER_STORAGE_LIMIT_MB, isBuiltIn: true }
      : { limitMb: configured, isBuiltIn: false };
  }

  /** Null resets to the built-in default. */
  async setDefaultLimitMb(limitMb: number | null): Promise<void> {
    await this.prisma.client.storageSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, defaultUserStorageLimitMb: limitMb },
      update: { defaultUserStorageLimitMb: limitMb },
    });
  }

  async usedBytesByUser(): Promise<Map<string, number>> {
    const rows = await this.prisma.client.attachment.groupBy({
      by: ["uploadedByUserId"],
      where: { uploadedByUserId: { not: null } },
      _sum: { sizeBytes: true },
    });
    return new Map(rows.map((row) => [row.uploadedByUserId as string, row._sum.sizeBytes ?? 0]));
  }

  limitBytesFor(user: { isGlobalAdmin: boolean; storageLimitMb: number | null }, defaultLimitMb: number): number | null {
    if (user.isGlobalAdmin) return null;
    return (user.storageLimitMb ?? defaultLimitMb) * BYTES_PER_MB;
  }

  async getUsage(userId: string): Promise<StorageUsage> {
    const [user, aggregate, { limitMb }] = await Promise.all([
      this.prisma.client.user.findUniqueOrThrow({
        where: { id: userId },
        select: { isGlobalAdmin: true, storageLimitMb: true },
      }),
      this.prisma.client.attachment.aggregate({
        where: { uploadedByUserId: userId },
        _sum: { sizeBytes: true },
      }),
      this.getDefaultLimitMb(),
    ]);
    return { usedBytes: aggregate._sum.sizeBytes ?? 0, limitBytes: this.limitBytesFor(user, limitMb) };
  }

  /** Throws 413 if storing `incomingBytes` more would take the user over their limit. */
  async assertCanStore(userId: string, incomingBytes: number): Promise<void> {
    const { usedBytes, limitBytes } = await this.getUsage(userId);
    if (limitBytes !== null && usedBytes + incomingBytes > limitBytes) {
      throw new PayloadTooLargeException({
        code: "STORAGE_LIMIT_EXCEEDED",
        message: `This upload would exceed your storage limit (${formatMb(usedBytes)} of ${formatMb(limitBytes)} used).`,
        usedBytes,
        limitBytes,
      });
    }
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}
