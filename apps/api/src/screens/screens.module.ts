import { Module } from "@nestjs/common";
import { SetlistsModule } from "../setlists/setlists.module.js";
import { ScreensController } from "./screens.controller.js";
import { ScreensService } from "./screens.service.js";

/** Screens (issue #186): pairing, what a screen shows; the sync server signs them in. */
@Module({
  imports: [SetlistsModule],
  controllers: [ScreensController],
  providers: [ScreensService],
  exports: [ScreensService],
})
export class ScreensModule {}
