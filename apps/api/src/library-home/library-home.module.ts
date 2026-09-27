import { Module } from "@nestjs/common";
import { SongVersionsModule } from "../song-versions/song-versions.module.js";
import { LibraryHomeController } from "./library-home.controller.js";
import { LibraryHomeService } from "./library-home.service.js";

@Module({
  imports: [SongVersionsModule],
  controllers: [LibraryHomeController],
  providers: [LibraryHomeService],
})
export class LibraryHomeModule {}
