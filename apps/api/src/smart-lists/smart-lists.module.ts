import { Module } from "@nestjs/common";
import { SmartListsController } from "./smart-lists.controller.js";
import { SmartListsService } from "./smart-lists.service.js";

@Module({
  controllers: [SmartListsController],
  providers: [SmartListsService],
})
export class SmartListsModule {}
