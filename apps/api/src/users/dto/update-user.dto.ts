import { ApiProperty } from "@nestjs/swagger";
import { SUPPORTED_LOCALES } from "@songverse/core";
import { IsIn, IsOptional } from "class-validator";

export class UpdateUserDto {
  @ApiProperty({ description: "UI language", enum: SUPPORTED_LOCALES, required: false })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: (typeof SUPPORTED_LOCALES)[number];
}
