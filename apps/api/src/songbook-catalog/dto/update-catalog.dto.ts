import { ApiProperty } from "@nestjs/swagger";
import { ISO_639_1_CODES, type SongbookSection } from "@songverse/core";
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class UpdateCatalogDto {
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  publisher?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  isbn?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  officialUrl?: string;

  @ApiProperty({ required: false, enum: ISO_639_1_CODES, description: "ISO 639-1 language code" })
  @IsOptional()
  @IsIn(ISO_639_1_CODES)
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  licensed?: boolean;

  @ApiProperty({
    required: false,
    description: 'The printed volumes: an ordered list of {label, start, end} number ranges ("JEM1": 1-371...). Copied into songbooks imported from the catalogue.',
  })
  @IsOptional()
  @IsArray()
  sections?: SongbookSection[];
}
