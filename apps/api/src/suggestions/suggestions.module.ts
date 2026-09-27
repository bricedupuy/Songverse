import { Module } from "@nestjs/common";
import { SongVersionsModule } from "../song-versions/song-versions.module.js";
import { SuggestionsController } from "./suggestions.controller.js";
import { SuggestionsService } from "./suggestions.service.js";

@Module({
  imports: [SongVersionsModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
})
export class SuggestionsModule {}
