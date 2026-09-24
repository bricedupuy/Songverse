import { Module } from "@nestjs/common";
import { ArrangementsController } from "./arrangements.controller";
import { ArrangementsService } from "./arrangements.service";

@Module({
  controllers: [ArrangementsController],
  providers: [ArrangementsService],
  exports: [ArrangementsService],
})
export class ArrangementsModule {}
