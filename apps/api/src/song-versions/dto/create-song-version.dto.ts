import { ApiProperty } from "@nestjs/swagger";
import { ISO_639_1_CODES } from "@songverse/core";
import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

  @ApiProperty({ type: [String], description: "Who performs it: at least one artist (band or person)" })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((name) => (typeof name === "string" ? name.trim() : name)).filter((name) => name !== "") : value,
  )
  @IsArray()
  @ArrayMinSize(1, { message: "A song needs at least one artist" })
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  artists!: string[];

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
