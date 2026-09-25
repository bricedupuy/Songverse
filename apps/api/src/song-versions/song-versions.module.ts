import { Module } from "@nestjs/common";
import { MusicBrainzModule } from "../musicbrainz/musicbrainz.module";
import { SongVersionsController } from "./song-versions.controller";
import { SongHistoryService } from "./song-history.service";
import { SongVersionsService } from "./song-versions.service";

@Module({
  imports: [MusicBrainzModule],
  controllers: [SongVersionsController],
  providers: [SongVersionsService, SongHistoryService],
  exports: [SongVersionsService, SongHistoryService],
})
export class SongVersionsModule {}
