import { ApiProperty } from "@nestjs/swagger";
import { INSTRUMENTS, SUPPORTED_LOCALES, TECH_ROLES } from "@songverse/core";
import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

  @ApiProperty({ description: "Instruments played; replaces the current list", enum: INSTRUMENTS, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(INSTRUMENTS.length)
  @IsIn(INSTRUMENTS, { each: true })
  instruments?: (typeof INSTRUMENTS)[number][];

  @ApiProperty({ description: "Technical roles; replaces the current list", enum: TECH_ROLES, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TECH_ROLES.length)
  @IsIn(TECH_ROLES, { each: true })
  techRoles?: (typeof TECH_ROLES)[number][];
}
