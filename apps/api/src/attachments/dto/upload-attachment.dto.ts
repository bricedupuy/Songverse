import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

const ATTACHMENT_TYPES = ["PDF", "CHORDPRO", "MUSICXML", "ABC_NOTATION", "TEXT", "IMAGE"] as const;
export type AttachmentTypeValue = (typeof ATTACHMENT_TYPES)[number];

export class UploadAttachmentDto {
  @ApiProperty({ enum: ATTACHMENT_TYPES })
  @IsIn(ATTACHMENT_TYPES)
  type!: AttachmentTypeValue;
}
