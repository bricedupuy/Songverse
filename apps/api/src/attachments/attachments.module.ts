import { Module } from "@nestjs/common";
import { ImagesModule } from "../images/images.module";
import { SongVersionsModule } from "../song-versions/song-versions.module";
import { StorageModule } from "../storage/storage.module";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { FileLinksService } from "../files/file-links.service";
import { FilesController } from "../files/files.controller";

@Module({
  imports: [ImagesModule, StorageModule, SongVersionsModule],
  controllers: [AttachmentsController, FilesController],
  providers: [AttachmentsService, FileLinksService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
