import { ApiProperty } from "@nestjs/swagger";
import { STEM_PARTS, type StemPart } from "@songverse/core";
import { Transform } from "class-transformer";
import { IsIn, IsOptional, ValidateIf } from "class-validator";

const ATTACHMENT_TYPES = ["PDF", "CHORDPRO", "MUSICXML", "ABC_NOTATION", "TEXT", "IMAGE", "AUDIO", "OTHER"] as const;
export type AttachmentTypeValue = (typeof ATTACHMENT_TYPES)[number];

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
}

export class UpdateAttachmentDto {
  @ApiProperty({ enum: STEM_PARTS, nullable: true, description: "The part of the song an AUDIO file is; null for none (a full mix)." })
  @ValidateIf((_, value) => value !== null)
  @IsIn(STEM_PARTS)
  stemPart!: StemPart | null;
}
