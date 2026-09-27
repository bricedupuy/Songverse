import { Module } from "@nestjs/common";
import { ImagesModule } from "../images/images.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [StorageModule, ImagesModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
