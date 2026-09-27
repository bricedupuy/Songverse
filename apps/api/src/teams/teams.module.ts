import { Module } from "@nestjs/common";
import { TeamsController } from "./teams.controller.js";
import { TeamsService } from "./teams.service.js";

@Module({
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
