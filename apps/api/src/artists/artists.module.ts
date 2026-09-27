import { Module } from "@nestjs/common";
import { ImagesModule } from "../images/images.module.js";
import { MetadataModule } from "../metadata/metadata.module.js";
import { MusicBrainzModule } from "../musicbrainz/musicbrainz.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { ArtistsController } from "./artists.controller.js";
import { ArtistsService } from "./artists.service.js";

@Module({
  imports: [MusicBrainzModule, StorageModule, ImagesModule, MetadataModule],
  controllers: [ArtistsController],
  providers: [ArtistsService],
  exports: [ArtistsService],
})
export class ArtistsModule {}
