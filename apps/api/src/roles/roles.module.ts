import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { AdminRolesController } from "./roles.controller.js";
import { RolesService } from "./roles.service.js";

@Module({
  imports: [StorageModule],
  controllers: [AdminRolesController],
  providers: [RolesService],
})
export class RolesModule {}
