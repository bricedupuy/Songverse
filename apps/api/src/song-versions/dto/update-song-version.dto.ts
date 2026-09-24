import { ApiProperty } from "@nestjs/swagger";
import { ISO_639_1_CODES } from "@songverse/core";
import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { SongFieldsDto, trimNames } from "./song-fields.dto";

/**
 * Partial update: a field left out is left alone; null (or "") clears it.
 * Title, language and artists can't be cleared.
 */
export class UpdateSongVersionDto extends SongFieldsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @ApiProperty({ required: false, type: [String], description: "Replaces the song's artists; at least one" })
  @IsOptional()
  @Transform(trimNames)
  @IsArray()
  @ArrayMinSize(1, { message: "A song needs at least one artist" })
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  artists?: string[];

  @ApiProperty({ required: false, enum: ISO_639_1_CODES, description: "ISO 639-1 language code" })
  @IsOptional()
  @IsIn(ISO_639_1_CODES)
  language?: string;

  @ApiProperty({
    required: false,
    description: "The document revision the edit started from; a save is refused (409) if the song was saved since",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  revision?: number;
}
