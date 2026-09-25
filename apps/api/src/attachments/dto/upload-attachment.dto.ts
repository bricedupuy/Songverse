import { ApiProperty } from "@nestjs/swagger";
import { STEM_PARTS, type StemPart } from "@songverse/core";
import { Transform } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

const ATTACHMENT_TYPES = ["PDF", "CHORDPRO", "MUSICXML", "ABC_NOTATION", "TEXT", "IMAGE", "AUDIO", "OTHER"] as const;
export type AttachmentTypeValue = (typeof ATTACHMENT_TYPES)[number];
export const ATTACHMENT_VISIBILITIES = ["PRIVATE", "TEAM", "SONG"] as const;
export type AttachmentVisibilityValue = (typeof ATTACHMENT_VISIBILITIES)[number];

export class UploadAttachmentDto {
  @ApiProperty({ enum: ATTACHMENT_TYPES })
  @IsIn(ATTACHMENT_TYPES)
  type!: AttachmentTypeValue;

  @ApiProperty({ enum: STEM_PARTS, required: false, description: "For AUDIO: the part of the song this file is (a stem), for the stem player." })
  @IsOptional()
  // A form field can't be undefined; an empty one means no part.
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsIn(STEM_PARTS)
  stemPart?: StemPart;

  @ApiProperty({
    enum: ATTACHMENT_VISIBILITIES,
    required: false,
    description: "Who sees it besides you: PRIVATE (nobody, the default), TEAM (teamId's members), SONG (everyone who sees the song; needs edit rights on it).",
  })
  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsIn(ATTACHMENT_VISIBILITIES)
  visibility?: AttachmentVisibilityValue;

  @ApiProperty({ required: false, description: "For TEAM: a team you belong to." })
  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsString()
  teamId?: string;
}

/** What's left out stays as it is; null clears it. */
export class UpdateAttachmentDto {
  @ApiProperty({ enum: STEM_PARTS, nullable: true, required: false, description: "The part of the song an AUDIO file is; null for none (a full mix)." })
  @IsOptional()
  @IsIn(STEM_PARTS)
  stemPart?: StemPart | null;

  @ApiProperty({ nullable: true, required: false, description: "For AUDIO: the recording's key, as written (\"G\", \"Bbm\"); null (or empty) for the song's own." })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  recordingKey?: string | null;

  @ApiProperty({ nullable: true, required: false, description: "For AUDIO: the recording's tempo in BPM (20-400); null for the song's own." })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(400)
  recordingTempo?: number | null;

  @ApiProperty({ enum: ATTACHMENT_VISIBILITIES, required: false, description: "Who sees it (its uploader only): see UploadAttachmentDto." })
  @IsOptional()
  @IsIn(ATTACHMENT_VISIBILITIES)
  visibility?: AttachmentVisibilityValue;

  @ApiProperty({ required: false, description: "For TEAM: a team you belong to." })
  @IsOptional()
  @IsString()
  teamId?: string;
}
