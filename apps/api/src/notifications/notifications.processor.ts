import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { notificationEmail, notificationPreferences, type Messages, type NotificationData, type NotificationKind } from "@songverse/core";
import en from "@songverse/core/i18n/locales/en";
import fr from "@songverse/core/i18n/locales/fr";
import type { Job } from "bullmq";
import { sendNotificationEmail } from "../auth/email.js";
import { JOB_WORKER_OPTIONS, NOTIFICATIONS_QUEUE } from "../jobs/jobs.constants.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { getEffectiveNotificationSettings } from "./notification-settings.js";
import type { DeliverJob } from "./notifications.service.js";

const MESSAGES: Record<string, Messages> = { en, fr };

/**
 * Notifications by email (issue #236): each batch made together, one
 * email per person - only when this server sends them (Admin >
 * Notifications) and the person wants that kind by email, to an address
 * they've verified. Each notification is marked once looked at, sent or
 * not, so a retried job never emails it twice.
 */
@Processor(NOTIFICATIONS_QUEUE, JOB_WORKER_OPTIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<DeliverJob>): Promise<{ emailed: number }> {
    const rows = await this.prisma.client.notification.findMany({
      where: { id: { in: job.data.ids }, emailedAt: null },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { email: true, emailVerified: true, locale: true, notificationSettings: true } } },
    });
    if (rows.length === 0) return { emailed: 0 };
    const { emailEnabled } = await getEffectiveNotificationSettings();
    let emailed = 0;
    const byUser = new Map<string, typeof rows>();
    for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
    for (const list of byUser.values()) {
      const user = list[0]!.user;
      const choices = notificationPreferences(user.notificationSettings);
      const wanted = emailEnabled && user.emailVerified ? list.filter((row) => choices[row.kind as NotificationKind]?.email) : [];
      if (wanted.length > 0) {
        const messages = MESSAGES[user.locale] ?? en;
        const email = notificationEmail(wanted.map((row) => ({ kind: row.kind as NotificationKind, data: row.data as NotificationData })), messages, user.locale);
        // One link: the first one's (they're about the same thing), else My calendar.
        const path = wanted.find((row) => row.url)?.url ?? "/calendar";
        await sendNotificationEmail(user.email, {
          ...email,
          open: messages.notifications.email.open,
          url: `${job.data.webUrl}${path}`,
          why: messages.notifications.email.why,
          settingsUrl: `${job.data.webUrl}/account`,
        });
        emailed += 1;
      }
      await this.prisma.client.notification.updateMany({ where: { id: { in: list.map((row) => row.id) } }, data: { emailedAt: new Date() } });
    }
    if (emailed > 0) this.logger.log(`Emailed notifications to ${emailed} person(s)`);
    return { emailed };
  }
}
