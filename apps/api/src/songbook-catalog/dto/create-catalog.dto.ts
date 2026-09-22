import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class CreateCatalogDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  abbreviation?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  publisher?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  isbn?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  officialUrl?: string;

  @ApiProperty({ required: false, description: "BCP 47 language tag, e.g. en, fr, de" })
  @IsOptional()
  @IsString()
  @MaxLength(35)
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  denomination?: string;

  @ApiProperty({ required: false, description: "Publisher-stated total song count, may exceed catalogued entries" })
  @IsOptional()
  @IsInt()
  totalEntries?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  licensed?: boolean;
}
