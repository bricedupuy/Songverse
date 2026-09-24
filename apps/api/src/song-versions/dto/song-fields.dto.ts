import { ApiProperty } from "@nestjs/swagger";
import { SONG_DOCUMENT_LIMITS, SUPPORTED_IMPORT_FORMATS, type SupportedImportFormat } from "@songverse/core";
import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";

/** "" means clear, like null. */
export const trimOrNull = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() || null : value);
export const notNull = (_: object, value: unknown) => value !== null;
/** Trimmed names, blanks dropped. */
export const trimNames = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((name) => (typeof name === "string" ? name.trim() : name)).filter((name) => name !== "") : value;

/**
 * A song's optional fields, shared by create and (partial) update. Left
 * out, a field is left alone; null (or "") clears it. The name lists and
 * tagIds replace what the song has; content replaces its chart.
 */
export class SongFieldsDto {
  @ApiProperty({ required: false, nullable: true, description: 'Shown as "Subtitle"' })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(300)
  alternateTitle?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Tells this version apart from the song\'s others, e.g. "Acoustic"' })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(100)
  versionName?: string | null;

  @ApiProperty({ required: false, nullable: true, description: "How to sort it, if not by title" })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(300)
  sortTitle?: string | null;

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

  @ApiProperty({ required: false, nullable: true, description: "Capo fret for the chords as written; 0 or null for none" })
  @IsOptional()
  @ValidateIf(notNull)
  @IsInt()
  @Min(0)
  @Max(11)
  capo?: number | null;

  @ApiProperty({ required: false, type: [String], description: "Replaces the song's composers" })
  @IsOptional()
  @Transform(trimNames)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  composers?: string[];

  @ApiProperty({ required: false, type: [String], description: "Replaces the song's lyricists" })
  @IsOptional()
  @Transform(trimNames)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  lyricists?: string[];
  @ApiProperty({ required: false, type: [String], description: "Replaces the song's writers (words and music)" })
  @IsOptional()
  @Transform(trimNames)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  writers?: string[];
  @ApiProperty({ required: false, type: [String], description: "Replaces the song's arrangers" })
  @IsOptional()
  @Transform(trimNames)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  arrangers?: string[];
  @ApiProperty({ required: false, type: [String], description: "Replaces the song's translators" })
  @IsOptional()
  @Transform(trimNames)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  translators?: string[];
  @ApiProperty({ required: false, type: [String], description: "Replaces the song's adaptors" })
  @IsOptional()
  @Transform(trimNames)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  adaptors?: string[];

  @ApiProperty({ required: false, type: [String], description: "Replaces the song's tags (ids of tags you can see)" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  tagIds?: string[];

  @ApiProperty({ required: false, description: "Chart text to replace the song's content with" })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  content?: string;

  @ApiProperty({ required: false, enum: SUPPORTED_IMPORT_FORMATS, description: "content's format; guessed when left out" })
  @IsOptional()
  @IsIn(SUPPORTED_IMPORT_FORMATS)
  contentFormat?: SupportedImportFormat;

  @ApiProperty({
    required: false,
    type: "array",
    items: { type: "object" },
    description:
      "The chart as SongDocument v2 sections (docs/song-document-v2.md), IDs and all - what the structured editor saves. Instead of content, not with it.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SONG_DOCUMENT_LIMITS.sections)
  sections?: unknown[];

  @ApiProperty({
    required: false,
    type: "array",
    items: { type: "object" },
    description:
      "The order the song is sung in (SongDocument v2 `flow`: repeats, a pass's label, key change and note). Left out, it follows the sections.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SONG_DOCUMENT_LIMITS.flowItems)
  flow?: unknown[];
}
