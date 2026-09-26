import { Module } from "@nestjs/common";
import { ArtworkModule } from "../artwork/artwork.module";
import { MusicBrainzModule } from "../musicbrainz/musicbrainz.module";
import { MetadataController } from "./metadata.controller";
import { MetadataService } from "./metadata.service";

@Module({
  imports: [MusicBrainzModule, ArtworkModule],
  controllers: [MetadataController],
  providers: [MetadataService],
  exports: [MetadataService],
})
export class MetadataModule {}
