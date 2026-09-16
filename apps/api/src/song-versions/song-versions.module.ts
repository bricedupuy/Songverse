import { Module } from "@nestjs/common";
import { MusicBrainzModule } from "../musicbrainz/musicbrainz.module";
import { SongVersionsController } from "./song-versions.controller";
import { SongVersionsService } from "./song-versions.service";

@Module({
  imports: [MusicBrainzModule],
  controllers: [SongVersionsController],
  providers: [SongVersionsService],
})
export class SongVersionsModule {}
