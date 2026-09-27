import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { BULK_UPLOAD_QUEUE } from "../bulk-upload/bulk-upload.types";
import { USER_MAINTENANCE_QUEUE } from "../user-management/transfer-expiry.processor";
import { JobsController } from "./jobs.controller";
import { BACKFILLS_QUEUE, LOOKUPS_QUEUE } from "./jobs.constants";
import { JobsService } from "./jobs.service";

@Module({
  imports: [BullModule.registerQueue({ name: LOOKUPS_QUEUE }, { name: BACKFILLS_QUEUE }, { name: BULK_UPLOAD_QUEUE }, { name: USER_MAINTENANCE_QUEUE })],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
