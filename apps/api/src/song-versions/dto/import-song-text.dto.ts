import { ApiProperty } from "@nestjs/swagger";
import { SUPPORTED_IMPORT_FORMATS, type SupportedImportFormat } from "@songverse/core";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class ImportSongTextDto {
  @ApiProperty({ description: "Raw text to replace this version's content with" })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiProperty({
    description: "The pasted text's format",
    enum: SUPPORTED_IMPORT_FORMATS,
    default: "CHORDPRO",
    required: false,
  })
  @IsOptional()
  @IsIn(SUPPORTED_IMPORT_FORMATS)
  format?: SupportedImportFormat;
}
