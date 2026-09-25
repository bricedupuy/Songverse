import { Module } from "@nestjs/common";
import { SmartListsController } from "./smart-lists.controller";
import { SmartListsService } from "./smart-lists.service";

@Module({
  controllers: [SmartListsController],
  providers: [SmartListsService],
})
export class SmartListsModule {}
