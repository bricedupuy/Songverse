import { Module } from "@nestjs/common";
import { SongVersionsModule } from "../song-versions/song-versions.module";
import { SuggestionsController } from "./suggestions.controller";
import { SuggestionsService } from "./suggestions.service";

@Module({
  imports: [SongVersionsModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
})
export class SuggestionsModule {}
