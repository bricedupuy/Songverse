import { Module } from "@nestjs/common";
import { SongVersionsModule } from "../song-versions/song-versions.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { SongbookEntriesController, SongbooksController } from "./songbooks.controller.js";
import { SongbooksService } from "./songbooks.service.js";

@Module({
  imports: [SongVersionsModule, StorageModule],
  controllers: [SongbooksController, SongbookEntriesController],
  providers: [SongbooksService],
  exports: [SongbooksService],
})
export class SongbooksModule {}
