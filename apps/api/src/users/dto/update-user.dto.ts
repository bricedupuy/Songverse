import { ApiProperty } from "@nestjs/swagger";
import { SUPPORTED_LOCALES } from "@songverse/core";
import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateUserDto {
  @ApiProperty({ description: "UI language", enum: SUPPORTED_LOCALES, required: false })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: (typeof SUPPORTED_LOCALES)[number];

  @ApiProperty({ required: false, maxLength: 80 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;
}
