import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { UserManagementModule } from "../user-management/user-management.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [StorageModule, UserManagementModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
