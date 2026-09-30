import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { TeamsController } from "./teams.controller.js";
import { TeamsService } from "./teams.service.js";

@Module({
  imports: [StorageModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
