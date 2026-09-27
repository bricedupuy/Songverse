import { Module } from "@nestjs/common";
import { MusicBrainzClientService } from "./musicbrainz-client.service.js";
import { MusicBrainzController } from "./musicbrainz.controller.js";
import { MusicBrainzService } from "./musicbrainz.service.js";

@Module({
  controllers: [MusicBrainzController],
  providers: [MusicBrainzClientService, MusicBrainzService],
  exports: [MusicBrainzService],
})
export class MusicBrainzModule {}
