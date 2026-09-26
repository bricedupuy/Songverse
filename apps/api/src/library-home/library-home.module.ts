import { Module } from "@nestjs/common";
import { SongVersionsModule } from "../song-versions/song-versions.module";
import { LibraryHomeController } from "./library-home.controller";
import { LibraryHomeService } from "./library-home.service";

@Module({
  imports: [SongVersionsModule],
  controllers: [LibraryHomeController],
  providers: [LibraryHomeService],
})
export class LibraryHomeModule {}
