import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { UserManagementModule } from "../user-management/user-management.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";

@Module({
  imports: [StorageModule, UserManagementModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
