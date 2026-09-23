import { ApiProperty } from "@nestjs/swagger";
import { ISO_639_1_CODES } from "@songverse/core";
import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SongFieldsDto, trimNames } from "./song-fields.dto";

export class CreateSongVersionDto extends SongFieldsDto {
  @ApiProperty({
    required: false,
    description: "Existing Work to add this version to. Omit to create a new Work (this becomes its preferred original version).",
  })
  @IsOptional()
  @IsString()
  workId?: string;

  @ApiProperty({
    required: false,
    description: "A song you can see that this is another version of (an acoustic arrangement, say): it joins that song's Work.",
  })
  @IsOptional()
  @IsString()
  basedOnVersionId?: string;

  @ApiProperty({
    required: false,
    description: "Team to own this version under (must be a member). Omit to own it personally.",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiProperty({ type: [String], description: "Who performs it: at least one artist (band or person)" })
  @Transform(trimNames)
  @IsArray()
  @ArrayMinSize(1, { message: "A song needs at least one artist" })
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  artists!: string[];

  @ApiProperty({ enum: ISO_639_1_CODES, description: "ISO 639-1 language code" })
  @IsIn(ISO_639_1_CODES)
  language!: string;
}
