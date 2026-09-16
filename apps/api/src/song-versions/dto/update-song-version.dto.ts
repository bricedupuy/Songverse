import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

  @ApiProperty({ required: false, description: "BCP 47 language tag, e.g. en, fr, de" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(35)
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
}
