import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const SONG_SORTS = ["title", "updatedAt", "createdAt", "language", "publicationState"] as const;
export type SongSort = (typeof SONG_SORTS)[number];

const toInt = ({ value }: { value: unknown }) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value);
const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

/** GET /song-versions: one page of the songs you can see, optionally searched and filtered. */
export class ListSongVersionsQueryDto {
  @ApiProperty({ required: false, description: "Matches title, subtitle, version name, artist, or an exact CCLI number (ignoring case)" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiProperty({ required: false, description: "ISO 639-1 language code" })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiProperty({ required: false, description: "Only songs with this tag" })
  @IsOptional()
  @IsString()
  tagId?: string;

  @ApiProperty({ required: false, enum: SONG_SORTS, default: "updatedAt" })
  @IsOptional()
  @IsIn(SONG_SORTS)
  sort?: SongSort;

  @ApiProperty({ required: false, enum: ["asc", "desc"], description: "Defaults to desc for dates, asc otherwise" })
  @IsOptional()
  @IsIn(["asc", "desc"])
  dir?: "asc" | "desc";

  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
