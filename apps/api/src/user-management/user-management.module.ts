import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { AdminUsersService } from "./admin-users.service";
import { ContentTransfersController } from "./content-transfers.controller";
import { ContentTransfersService } from "./content-transfers.service";
import { TransferExpiryProcessor, TransferExpiryScheduler, USER_MAINTENANCE_QUEUE } from "./transfer-expiry.processor";
import { UserDeletionService } from "./user-deletion.service";

@Module({
  imports: [BullModule.registerQueue({ name: USER_MAINTENANCE_QUEUE }), StorageModule],
  controllers: [ContentTransfersController],
  providers: [UserDeletionService, ContentTransfersService, AdminUsersService, TransferExpiryProcessor, TransferExpiryScheduler],
  exports: [AdminUsersService],
})
export class UserManagementModule {}
