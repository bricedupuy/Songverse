import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
