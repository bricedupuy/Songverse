import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { SongVersionsModule } from "../song-versions/song-versions.module";
import { SongbooksModule } from "../songbooks/songbooks.module";
import { StorageModule } from "../storage/storage.module";
import { BulkUploadController } from "./bulk-upload.controller";
import { BulkUploadProcessor } from "./bulk-upload.processor";
import { BulkUploadService } from "./bulk-upload.service";
import { BULK_UPLOAD_QUEUE } from "./bulk-upload.types";

@Module({
  imports: [BullModule.registerQueue({ name: BULK_UPLOAD_QUEUE }), StorageModule, SongbooksModule, SongVersionsModule],
  controllers: [BulkUploadController],
  providers: [BulkUploadService, BulkUploadProcessor],
})
export class BulkUploadModule {}
