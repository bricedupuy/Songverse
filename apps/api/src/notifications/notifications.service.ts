import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { notificationPreferences, withNotificationChanges, type NotificationData, type NotificationKind, type UpdateNotificationPreferencesRequest } from "@songverse/core";
import type { Prisma } from "@songverse/db";
import type { Queue } from "bullmq";
import { NOTIFICATIONS_QUEUE } from "../jobs/jobs.constants.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { getEffectiveNotificationSettings } from "./notification-settings.js";

/** The web app's address, for the links in emails: the API knows it, the Worker may not. */
const webUrl = () => (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** A batch of notifications to send by email (and later push): the ones made together. */
export interface DeliverJob {
  ids: string[];
  webUrl: string;
}

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
 * first, and marks them read. Each batch made together is then sent by
 * email, as each person chooses, by the notifications job - never inside
 * the request.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  /** Notifications sent: one each, to everyone but `except` (who made the change). */
  async notify(notifications: NotificationInput[], except: string | null = null): Promise<number> {
    const sent = notifications.filter((one) => one.userId !== except);
    if (sent.length === 0) return 0;
    const rows = await this.prisma.client.notification.createManyAndReturn({
      data: sent.map((one) => ({ userId: one.userId, kind: one.kind, data: one.data as Prisma.InputJsonValue, url: one.url ?? null })),
      select: { id: true },
    });
    // Already in the bell; the email can wait for the queue, but a queue that's down mustn't fail the change.
    await this.queue.add("deliver", { ids: rows.map((row) => row.id), webUrl: webUrl() } satisfies DeliverJob, { removeOnComplete: 100, removeOnFail: 100 }).catch((error: unknown) => {
      this.logger.warn(`Notifications not queued for email: ${error instanceof Error ? error.message : String(error)}`);
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

  /** One's choices of how each kind reaches them, and whether this server emails at all. */
  async preferences(userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { notificationSettings: true } });
    return { kinds: notificationPreferences(user?.notificationSettings), emailAvailable: (await getEffectiveNotificationSettings()).emailEnabled };
  }

  /** Choices changed: what's left out stays as it was. */
  async updatePreferences(userId: string, dto: UpdateNotificationPreferencesRequest) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { notificationSettings: true } });
    await this.prisma.client.user.update({ where: { id: userId }, data: { notificationSettings: withNotificationChanges(user?.notificationSettings, dto.kinds) as Prisma.InputJsonValue } });
    return this.preferences(userId);
  }
}
