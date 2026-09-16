import { Module } from "@nestjs/common";
import { MusicBrainzClientService } from "./musicbrainz-client.service";
import { MusicBrainzController } from "./musicbrainz.controller";
import { MusicBrainzService } from "./musicbrainz.service";

@Module({
  controllers: [MusicBrainzController],
  providers: [MusicBrainzClientService, MusicBrainzService],
  exports: [MusicBrainzService],
})
export class MusicBrainzModule {}
