import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { SongVersionsModule } from "../song-versions/song-versions.module.js";
import { SongbooksModule } from "../songbooks/songbooks.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { BulkUploadController } from "./bulk-upload.controller.js";
import { BulkUploadProcessor } from "./bulk-upload.processor.js";
import { BulkUploadService } from "./bulk-upload.service.js";
import { BULK_UPLOAD_QUEUE } from "./bulk-upload.types.js";

@Module({
  imports: [BullModule.registerQueue({ name: BULK_UPLOAD_QUEUE }), StorageModule, SongbooksModule, SongVersionsModule],
  controllers: [BulkUploadController],
  providers: [BulkUploadService, BulkUploadProcessor],
})
export class BulkUploadModule {}
