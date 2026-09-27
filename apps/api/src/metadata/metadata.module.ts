import { Module } from "@nestjs/common";
import { MusicBrainzModule } from "../musicbrainz/musicbrainz.module.js";
import { MetadataController } from "./metadata.controller.js";
import { MetadataService } from "./metadata.service.js";

@Module({
  imports: [MusicBrainzModule],
  controllers: [MetadataController],
  providers: [MetadataService],
  exports: [MetadataService],
})
export class MetadataModule {}
