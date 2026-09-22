import { ApiProperty } from "@nestjs/swagger";
import { SONGBOOK_KINDS, type SongbookKindValue } from "@songverse/core";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSongbookDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    enum: SONGBOOK_KINDS,
    description: "SIMPLE = unordered collection; NUMBERED = entries require a unique per-songbook number",
  })
  @IsIn(SONGBOOK_KINDS)
  kind!: SongbookKindValue;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  abbreviation?: string;

  @ApiProperty({ required: false, description: "BCP 47 language tag, e.g. en, fr, de" })
  @IsOptional()
  @IsString()
  @MaxLength(35)
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
    description: "Team to own this songbook under (must be a member). Omit for USER scope, or set global instead.",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({
    required: false,
    description: "Create as a GLOBAL, admin-curated songbook visible to everyone. Global admins only.",
  })
  @IsOptional()
  @IsBoolean()
  global?: boolean;
}
