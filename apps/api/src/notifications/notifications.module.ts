import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { NOTIFICATIONS_QUEUE } from "../jobs/jobs.constants.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsProcessor } from "./notifications.processor.js";
import { NotificationsService } from "./notifications.service.js";

@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
