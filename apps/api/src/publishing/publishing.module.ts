import { Module } from "@nestjs/common";
import { SongVersionsModule } from "../song-versions/song-versions.module.js";
import { PublishingService } from "./publishing.service.js";
import { SongFoldController } from "./song-fold.controller.js";
import { SongFoldService } from "./song-fold.service.js";
import { SongPublishingController, SubmissionsController } from "./publishing.controller.js";

@Module({
  imports: [SongVersionsModule],
  controllers: [SongPublishingController, SubmissionsController, SongFoldController],
  providers: [PublishingService, SongFoldService],
})
export class PublishingModule {}
