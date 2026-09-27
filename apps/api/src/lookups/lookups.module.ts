import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ArtistsModule } from "../artists/artists.module";
import { ArtworkModule } from "../artwork/artwork.module";
import { BACKFILLS_QUEUE, LOOKUPS_QUEUE } from "../jobs/jobs.constants";
import { LookupsController } from "./lookups.controller";
import { BackfillsProcessor, LookupsProcessor } from "./lookups.processor";
import { LookupsService } from "./lookups.service";

@Module({
  imports: [BullModule.registerQueue({ name: LOOKUPS_QUEUE }, { name: BACKFILLS_QUEUE }), ArtworkModule, ArtistsModule],
  controllers: [LookupsController],
  providers: [LookupsService, LookupsProcessor, BackfillsProcessor],
  exports: [LookupsService],
})
export class LookupsModule {}
