import { ApiProperty } from "@nestjs/swagger";
import { STEM_PARTS, type StemPart } from "@songverse/core";

const ATTACHMENT_TYPES = ["PDF", "CHORDPRO", "MUSICXML", "ABC_NOTATION", "TEXT", "IMAGE", "AUDIO", "OTHER"] as const;

export class AttachmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() songVersionId!: string;
  @ApiProperty({ enum: ATTACHMENT_TYPES }) type!: (typeof ATTACHMENT_TYPES)[number];
  @ApiProperty() filename!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ required: false, nullable: true }) sizeBytes!: number | null;
  @ApiProperty({ enum: STEM_PARTS, nullable: true }) stemPart!: StemPart | null;
  @ApiProperty() createdAt!: Date;
}
