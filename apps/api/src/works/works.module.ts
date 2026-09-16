import { Module } from "@nestjs/common";
import { MusicBrainzModule } from "../musicbrainz/musicbrainz.module";
import { WorksController } from "./works.controller";
import { WorksService } from "./works.service";

@Module({
  imports: [MusicBrainzModule],
  controllers: [WorksController],
  providers: [WorksService],
})
export class WorksModule {}
