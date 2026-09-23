import { Module } from "@nestjs/common";
import { ImagesModule } from "../images/images.module";
import { StorageModule } from "../storage/storage.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [StorageModule, ImagesModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
