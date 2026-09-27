import { Module } from "@nestjs/common";
import { ImagesModule } from "../images/images.module.js";
import { SongVersionsModule } from "../song-versions/song-versions.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { AttachmentsController } from "./attachments.controller.js";
import { AttachmentsService } from "./attachments.service.js";
import { FileLinksService } from "../files/file-links.service.js";
import { FilesController } from "../files/files.controller.js";

@Module({
  imports: [ImagesModule, StorageModule, SongVersionsModule],
  controllers: [AttachmentsController, FilesController],
  providers: [AttachmentsService, FileLinksService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
