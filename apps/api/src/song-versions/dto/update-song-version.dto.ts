import { ApiProperty } from "@nestjs/swagger";
import { ISO_639_1_CODES } from "@songverse/core";
import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
/** "" means clear, like null. */
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() || null : value);
const notNull = (_: object, value: unknown) => value !== null;

/**
 * Partial update: a field left out is left alone; null (or "") clears it.
 * Title and language can't be cleared.
 */
export class UpdateSongVersionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @ApiProperty({ required: false, nullable: true, description: 'Shown as "Subtitle"' })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(300)
  alternateTitle?: string | null;

  @ApiProperty({ required: false, nullable: true, description: "How to sort it, if not by title" })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(300)
  sortTitle?: string | null;

  @ApiProperty({ required: false, enum: ISO_639_1_CODES, description: "ISO 639-1 language code" })
  @IsOptional()
  @IsIn(ISO_639_1_CODES)
  language?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(300)
  album?: string | null;

  @ApiProperty({ required: false, nullable: true, description: "Year written or published" })
  @IsOptional()
  @ValidateIf(notNull)
  @IsInt()
  @Min(1000)
  @Max(2999)
  year?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(500)
  copyright?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf(notNull)
  @IsInt()
  @Min(1000)
  @Max(2999)
  copyrightYear?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(300)
  publisher?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(50)
  ccli?: string | null;

  @ApiProperty({ required: false, nullable: true, description: "Recording code; dashes and spaces are dropped", example: "USRC17607839" })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() || null : value))
  @ValidateIf(notNull)
  @IsString()
  @Matches(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, { message: "ISRC must be 12 characters like USRC17607839" })
  isrc?: string | null;

  @ApiProperty({ required: false, nullable: true, description: "e.g. the scripture a song draws on" })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(300)
  reference?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n") || null : value))
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ApiProperty({ required: false, nullable: true, description: "Free-text key, e.g. G, Bb, C#m" })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(20)
  key?: string | null;

  @ApiProperty({ required: false, nullable: true, description: "Tempo in BPM" })
  @IsOptional()
  @ValidateIf(notNull)
  @IsInt()
  @Min(20)
  @Max(400)
  tempo?: number | null;

  @ApiProperty({ required: false, nullable: true, example: "4/4" })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @Matches(/^\d{1,2}\/\d{1,2}$/, { message: "timeSignature must be like 4/4 or 6/8" })
  timeSignature?: string | null;

  @ApiProperty({ required: false, nullable: true, description: "Running time in seconds" })
  @IsOptional()
  @ValidateIf(notNull)
  @IsInt()
  @Min(1)
  @Max(36000)
  durationSeconds?: number | null;
}
