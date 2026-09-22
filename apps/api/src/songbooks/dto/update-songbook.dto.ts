import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

  @ApiProperty({ required: false })
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
}
