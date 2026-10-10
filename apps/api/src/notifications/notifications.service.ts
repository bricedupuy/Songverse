import { Injectable } from "@nestjs/common";
import type { NotificationData, NotificationKind } from "@songverse/core";
import type { Prisma } from "@songverse/db";
import { PrismaService } from "../prisma/prisma.service.js";

/** One notification for someone: its kind, details and where it leads. */
export interface NotificationInput {
  userId: string;
  kind: NotificationKind;
  data: NotificationData;
  url?: string | null;
}

/**
 * What Songverse tells people (issue #236). A notification is stored as its
 * kind and details; each client puts it into words in the reader's language
 * (`notificationText` in @songverse/core). Each person reads theirs, newest
 * first, and marks them read.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Notifications sent: one each, to everyone but `except` (who made the change). */
  async notify(notifications: NotificationInput[], except: string | null = null): Promise<number> {
    const sent = notifications.filter((one) => one.userId !== except);
    if (sent.length === 0) return 0;
    await this.prisma.client.notification.createMany({
      data: sent.map((one) => ({ userId: one.userId, kind: one.kind, data: one.data as Prisma.InputJsonValue, url: one.url ?? null })),
    });
    return sent.length;
  }

  private summary(row: { id: string; kind: string; data: Prisma.JsonValue; url: string | null; readAt: Date | null; createdAt: Date }) {
    return { id: row.id, kind: row.kind, data: row.data, url: row.url, read: !!row.readAt, createdAt: row.createdAt.toISOString() };
  }

  /** Someone's notifications, newest first: `limit` of them after `before` (the last one shown), and how many are unread. */
  async list(userId: string, before?: string, limit = 30) {
    const cursor = before ? await this.prisma.client.notification.findFirst({ where: { id: before, userId }, select: { createdAt: true, id: true } }) : null;
    const rows = await this.prisma.client.notification.findMany({
      where: { userId, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    return { items: rows.slice(0, limit).map((row) => this.summary(row)), more: rows.length > limit, unread: await this.unread(userId) };
  }

  async unread(userId: string): Promise<number> {
    return this.prisma.client.notification.count({ where: { userId, readAt: null } });
  }

  /** These notifications, or all of them, marked read. */
  async markRead(userId: string, ids?: string[]): Promise<{ unread: number }> {
    await this.prisma.client.notification.updateMany({ where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    return { unread: await this.unread(userId) };
  }
}
