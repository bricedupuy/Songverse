import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

  @ApiProperty({ description: "BCP 47 language tag, e.g. en, fr, de" })
  @IsString()
  @MinLength(2)
  @MaxLength(35)
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
