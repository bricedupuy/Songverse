import { Module } from "@nestjs/common";
import { AdminInstrumentsController, InstrumentsController } from "./instruments.controller.js";
import { InstrumentsService } from "./instruments.service.js";

@Module({
  controllers: [InstrumentsController, AdminInstrumentsController],
  providers: [InstrumentsService],
})
export class InstrumentsModule {}
