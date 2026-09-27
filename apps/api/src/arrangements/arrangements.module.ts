import { Module } from "@nestjs/common";
import { ArrangementsController } from "./arrangements.controller.js";
import { ArrangementsService } from "./arrangements.service.js";

@Module({
  controllers: [ArrangementsController],
  providers: [ArrangementsService],
  exports: [ArrangementsService],
})
export class ArrangementsModule {}
