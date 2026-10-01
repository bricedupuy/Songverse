import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ScreensModule } from "../screens/screens.module.js";
import { SetlistsModule } from "../setlists/setlists.module.js";
import { SyncServer } from "./sync.server.js";

/** Sync play (issue #13): the WebSocket at /sync, attached in main.ts. */
@Module({
  imports: [AuthModule, SetlistsModule, ScreensModule],
  providers: [SyncServer],
  exports: [SyncServer],
})
export class SyncModule {}
