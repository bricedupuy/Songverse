import { Module } from "@nestjs/common";
import { PublishingService } from "./publishing.service";
import { SongPublishingController, SubmissionsController } from "./publishing.controller";

@Module({
  controllers: [SongPublishingController, SubmissionsController],
  providers: [PublishingService],
})
export class PublishingModule {}
