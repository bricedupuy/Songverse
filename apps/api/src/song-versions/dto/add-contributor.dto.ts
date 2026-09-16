import { ApiProperty } from "@nestjs/swagger";
import { CONTRIBUTOR_ROLES } from "@songverse/core";
import { ArrayMinSize, IsArray, IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class AddContributorDto {
  @ApiProperty({ description: "Free-text name, e.g. an artist, composer, or lyricist not registered on SongVerse" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  source!: string;

  @ApiProperty({ enum: CONTRIBUTOR_ROLES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(CONTRIBUTOR_ROLES, { each: true })
  roles!: (typeof CONTRIBUTOR_ROLES)[number][];
}
