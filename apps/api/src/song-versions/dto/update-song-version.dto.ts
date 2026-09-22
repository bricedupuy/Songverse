import { ApiProperty } from "@nestjs/swagger";
import { ISO_639_1_CODES } from "@songverse/core";
import { IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateSongVersionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  alternateTitle?: string;

  @ApiProperty({ required: false, enum: ISO_639_1_CODES, description: "ISO 639-1 language code" })
  @IsOptional()
  @IsIn(ISO_639_1_CODES)
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  copyright?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  copyrightYear?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  publisher?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ccli?: string;

  @ApiProperty({ required: false, description: "Free-text key, e.g. G, Bb, C#m" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  key?: string;

  @ApiProperty({ required: false, description: "Tempo in BPM" })
  @IsOptional()
  @IsInt()
  @IsPositive()
  tempo?: number;
}
