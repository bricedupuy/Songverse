import { Module } from "@nestjs/common";
import { SongVersionsController } from "./song-versions.controller";
import { SongVersionsService } from "./song-versions.service";

@Module({
  controllers: [SongVersionsController],
  providers: [SongVersionsService],
})
export class SongVersionsModule {}
