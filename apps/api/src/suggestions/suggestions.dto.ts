import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { UpdateSongVersionDto } from "../song-versions/dto/update-song-version.dto.js";

/** A suggested change: what the song editor would save, and a word for the reviewer. Tags aren't part of it. */
export class CreateSuggestionDto extends UpdateSongVersionDto {
  @ApiProperty({ required: false, description: "What it changes and why, for the reviewer." })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class ReviewSuggestionDto {
  @ApiProperty({ required: false, description: "A note for who suggested it; required to decline." })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListSuggestionsQueryDto {
  @ApiProperty({ required: false, enum: ["open", "closed"] })
  @IsOptional()
  @IsIn(["open", "closed"])
  state?: "open" | "closed";
}
