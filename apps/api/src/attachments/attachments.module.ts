import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { RECORDINGS_QUEUE } from "../jobs/jobs.constants.js";
import { RecordingsProcessor } from "../recordings/recordings.processor.js";
import { ImagesModule } from "../images/images.module.js";
import { SongVersionsModule } from "../song-versions/song-versions.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { AttachmentsController } from "./attachments.controller.js";
import { AttachmentsService } from "./attachments.service.js";
import { FileLinksService } from "../files/file-links.service.js";
import { FilesController } from "../files/files.controller.js";

@Module({
  imports: [BullModule.registerQueue({ name: RECORDINGS_QUEUE }), ImagesModule, StorageModule, SongVersionsModule],
  controllers: [AttachmentsController, FilesController],
  providers: [AttachmentsService, FileLinksService, RecordingsProcessor],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
