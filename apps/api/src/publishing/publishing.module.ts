import { Module } from "@nestjs/common";
import { SongVersionsModule } from "../song-versions/song-versions.module";
import { PublishingService } from "./publishing.service";
import { SongFoldController } from "./song-fold.controller";
import { SongFoldService } from "./song-fold.service";
import { SongPublishingController, SubmissionsController } from "./publishing.controller";

@Module({
  imports: [SongVersionsModule],
  controllers: [SongPublishingController, SubmissionsController, SongFoldController],
  providers: [PublishingService, SongFoldService],
})
export class PublishingModule {}
