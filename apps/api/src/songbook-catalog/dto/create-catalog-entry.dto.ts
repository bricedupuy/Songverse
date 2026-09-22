import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCatalogEntryDto {
  @ApiProperty({ description: 'The number/code this song has in the book, e.g. "0245"' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  entryCode!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiProperty({ required: false, description: "BCP 47 language tag" })
  @IsOptional()
  @IsString()
  @MaxLength(35)
  originalLanguage?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  composer?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  author?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ccli?: string;
}
