import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

// Only the pasted-text formats are implemented so far - LRC/MusicXML/ABC
// (also listed in IMPORT_FORMATS) don't have a parser yet.
const SUPPORTED_IMPORT_FORMATS = ["CHORDPRO", "CHORDS_OVER_LYRICS"] as const;
export type SupportedImportFormat = (typeof SUPPORTED_IMPORT_FORMATS)[number];

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
