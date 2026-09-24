import { Module } from "@nestjs/common";
import { AttachmentsModule } from "../attachments/attachments.module";
import { SetlistsModule } from "../setlists/setlists.module";
import { SongbooksModule } from "../songbooks/songbooks.module";
import { SongVersionsModule } from "../song-versions/song-versions.module";
import { OfflineController } from "./offline.controller";
import { OfflineService } from "./offline.service";

@Module({
  imports: [SetlistsModule, SongVersionsModule, SongbooksModule, AttachmentsModule],
  controllers: [OfflineController],
  providers: [OfflineService],
})
export class OfflineModule {}
