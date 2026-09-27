import { Module } from "@nestjs/common";
import { AttachmentsModule } from "../attachments/attachments.module.js";
import { SetlistsModule } from "../setlists/setlists.module.js";
import { SongbooksModule } from "../songbooks/songbooks.module.js";
import { SongVersionsModule } from "../song-versions/song-versions.module.js";
import { OfflineController } from "./offline.controller.js";
import { OfflineService } from "./offline.service.js";

@Module({
  imports: [SetlistsModule, SongVersionsModule, SongbooksModule, AttachmentsModule],
  controllers: [OfflineController],
  providers: [OfflineService],
})
export class OfflineModule {}
