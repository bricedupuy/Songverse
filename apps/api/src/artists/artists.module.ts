import { Module } from "@nestjs/common";
import { ImagesModule } from "../images/images.module";
import { MusicBrainzModule } from "../musicbrainz/musicbrainz.module";
import { StorageModule } from "../storage/storage.module";
import { ArtistsController } from "./artists.controller";
import { ArtistsService } from "./artists.service";

@Module({
  imports: [MusicBrainzModule, StorageModule, ImagesModule],
  controllers: [ArtistsController],
  providers: [ArtistsService],
  exports: [ArtistsService],
})
export class ArtistsModule {}
