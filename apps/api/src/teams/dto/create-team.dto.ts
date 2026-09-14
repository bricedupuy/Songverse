import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateTeamDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ required: false, description: "URL-safe identifier; derived from name if omitted" })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "slug must be lowercase letters, numbers, and hyphens" })
  slug?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
