import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { isPushEndpoint, notificationPreferences, quietHoursOf, withNotificationChanges, type CreatePushSubscriptionRequest, type NotificationData, type NotificationKind, type UpdateNotificationPreferencesRequest } from "@songverse/core";
import type { Prisma } from "@songverse/db";
import type { Queue } from "bullmq";
import { NOTIFICATIONS_QUEUE } from "../jobs/jobs.constants.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { getEffectiveNotificationSettings, getPushConfig, pushTestOrigins } from "./notification-settings.js";

/** The web app's address, for the links in emails: the API knows it, the Worker may not. */
const webUrl = () => (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** A batch of notifications to send by email (and later push): the ones made together. */
export interface DeliverJob {
  ids: string[];
  webUrl: string;
}

/** A test push to someone's devices. */
export interface TestPushJob {
  userId: string;
  webUrl: string;
}

/** The most devices someone turns notifications on for. */
const MAX_DEVICES = 20;

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

  /** One's choices of how each kind reaches them and their quiet hours; whether this server emails, and pushes (with its public key, to subscribe). */
  async preferences(userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { notificationSettings: true } });
    const [{ emailEnabled }, push] = await Promise.all([getEffectiveNotificationSettings(), getPushConfig()]);
    return { kinds: notificationPreferences(user?.notificationSettings), quiet: quietHoursOf(user?.notificationSettings), emailAvailable: emailEnabled, pushKey: push?.publicKey ?? null };
  }

  /** Choices changed: what's left out stays as it was; quiet hours null: none. */
  async updatePreferences(userId: string, dto: UpdateNotificationPreferencesRequest) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { notificationSettings: true } });
    const stored = user?.notificationSettings;
    const quiet = dto.quiet === undefined ? quietHoursOf(stored) : dto.quiet;
    const next = { ...withNotificationChanges(stored, dto.kinds ?? {}), quiet };
    await this.prisma.client.user.update({ where: { id: userId }, data: { notificationSettings: next as unknown as Prisma.InputJsonValue } });
    return this.preferences(userId);
  }

  /** The devices one turned notifications on for, newest first. */
  async devices(userId: string) {
    const rows = await this.prisma.client.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return rows.map((row) => ({ id: row.id, endpoint: row.endpoint, label: row.label, createdAt: row.createdAt.toISOString(), lastPushedAt: row.lastPushedAt?.toISOString() ?? null, lastError: row.lastError, lastErrorAt: row.lastErrorAt?.toISOString() ?? null }));
  }

  /** A device turned on: its browser's subscription, kept for this person (a browser someone else used before moves over). */
  async addDevice(userId: string, dto: CreatePushSubscriptionRequest) {
    if (!(await getPushConfig())) throw new BadRequestException(["This server doesn't send notifications to devices"]);
    if (!isPushEndpoint(dto.endpoint, pushTestOrigins())) throw new BadRequestException(["endpoint must be a push service's address"]);
    const existing = await this.prisma.client.pushSubscription.findUnique({ where: { endpoint: dto.endpoint } });
    if (!existing || existing.userId !== userId) {
      const count = await this.prisma.client.pushSubscription.count({ where: { userId } });
      if (count >= MAX_DEVICES) throw new BadRequestException([`You can turn on notifications for ${MAX_DEVICES} devices at most: remove one first`]);
    }
    const data = { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth, label: dto.label || null };
    const row = await this.prisma.client.pushSubscription.upsert({ where: { endpoint: dto.endpoint }, create: { endpoint: dto.endpoint, ...data }, update: data });
    return { id: row.id, endpoint: row.endpoint, label: row.label, createdAt: row.createdAt.toISOString(), lastPushedAt: row.lastPushedAt?.toISOString() ?? null, lastError: row.lastError, lastErrorAt: row.lastErrorAt?.toISOString() ?? null };
  }

  async removeDevice(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.client.pushSubscription.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException("Device not found");
  }

  /** A test notification to all one's devices, sent by the job, quiet hours or not. */
  async testPush(userId: string): Promise<void> {
    if (!(await getPushConfig())) throw new BadRequestException(["This server doesn't send notifications to devices"]);
    if ((await this.prisma.client.pushSubscription.count({ where: { userId } })) === 0) throw new BadRequestException(["Turn on notifications on a device first"]);
    await this.queue.add("test", { userId, webUrl: webUrl() } satisfies TestPushJob, { removeOnComplete: 100, removeOnFail: 100 });
  }
}
