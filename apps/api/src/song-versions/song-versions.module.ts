import { Module } from "@nestjs/common";
import { ArtworkModule } from "../artwork/artwork.module";
import { MetadataModule } from "../metadata/metadata.module";
import { MusicBrainzModule } from "../musicbrainz/musicbrainz.module";
import { StorageModule } from "../storage/storage.module";
import { SongVersionsController } from "./song-versions.controller";
import { SongHistoryService } from "./song-history.service";
import { SongVersionsService } from "./song-versions.service";

@Module({
  imports: [MusicBrainzModule, StorageModule, ArtworkModule, MetadataModule],
  controllers: [SongVersionsController],
  providers: [SongVersionsService, SongHistoryService],
  exports: [SongVersionsService, SongHistoryService],
})
export class SongVersionsModule {}
