import { Module } from "@nestjs/common";
import { ImagesModule } from "../images/images.module";
import { SongVersionsModule } from "../song-versions/song-versions.module";
import { StorageModule } from "../storage/storage.module";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";

@Module({
  imports: [ImagesModule, StorageModule, SongVersionsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
