import { ApiProperty } from "@nestjs/swagger";
import { ISO_639_1_CODES } from "@songverse/core";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSongVersionDto {
  @ApiProperty({
    required: false,
    description: "Existing Work to add this version to. Omit to create a new Work (this becomes its preferred original version).",
  })
  @IsOptional()
  @IsString()
  workId?: string;

  @ApiProperty({
    required: false,
    description: "Team to own this version under (must be a member). Omit to own it personally.",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  alternateTitle?: string;

  @ApiProperty({ enum: ISO_639_1_CODES, description: "ISO 639-1 language code" })
  @IsIn(ISO_639_1_CODES)
  language!: string;

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
}
