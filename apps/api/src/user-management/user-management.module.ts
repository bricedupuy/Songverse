import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { AdminUsersService } from "./admin-users.service.js";
import { ContentTransfersController } from "./content-transfers.controller.js";
import { ContentTransfersService } from "./content-transfers.service.js";
import { TransferExpiryProcessor, TransferExpiryScheduler, USER_MAINTENANCE_QUEUE } from "./transfer-expiry.processor.js";
import { UserDeletionService } from "./user-deletion.service.js";

@Module({
  imports: [BullModule.registerQueue({ name: USER_MAINTENANCE_QUEUE }), StorageModule],
  controllers: [ContentTransfersController],
  providers: [UserDeletionService, ContentTransfersService, AdminUsersService, TransferExpiryProcessor, TransferExpiryScheduler],
  exports: [AdminUsersService],
})
export class UserManagementModule {}
