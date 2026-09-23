import { Module } from "@nestjs/common";
import { SetlistsController } from "./setlists.controller";
import { SetlistsService } from "./setlists.service";

@Module({
  controllers: [SetlistsController],
  providers: [SetlistsService],
})
export class SetlistsModule {}
