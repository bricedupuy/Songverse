import { Module } from "@nestjs/common";
import { SongVersionsModule } from "../song-versions/song-versions.module";
import { SongbooksController } from "./songbooks.controller";
import { SongbooksService } from "./songbooks.service";

@Module({
  imports: [SongVersionsModule],
  controllers: [SongbooksController],
  providers: [SongbooksService],
  exports: [SongbooksService],
})
export class SongbooksModule {}
