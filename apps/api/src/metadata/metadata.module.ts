import { Module } from "@nestjs/common";
import { MusicBrainzModule } from "../musicbrainz/musicbrainz.module";
import { MetadataController } from "./metadata.controller";
import { MetadataService } from "./metadata.service";

@Module({
  imports: [MusicBrainzModule],
  controllers: [MetadataController],
  providers: [MetadataService],
  exports: [MetadataService],
})
export class MetadataModule {}
