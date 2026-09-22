import { ApiProperty } from "@nestjs/swagger";
import { ISO_639_1_CODES, type SongbookSection } from "@songverse/core";
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateSongbookDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  abbreviation?: string;

  @ApiProperty({ required: false, enum: ISO_639_1_CODES, description: "ISO 639-1 language code" })
  @IsOptional()
  @IsIn(ISO_639_1_CODES)
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  publisher?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  year?: number;

  @ApiProperty({
    required: false,
    description: "NUMBERED songbooks only - ordered list of {label, start, end} number ranges",
  })
  @IsOptional()
  @IsArray()
  sections?: SongbookSection[];
}
