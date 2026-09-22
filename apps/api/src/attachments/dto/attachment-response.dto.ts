import { ApiProperty } from "@nestjs/swagger";

const ATTACHMENT_TYPES = ["PDF", "CHORDPRO", "MUSICXML", "ABC_NOTATION", "TEXT", "IMAGE"] as const;

export class AttachmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() songVersionId!: string;
  @ApiProperty({ enum: ATTACHMENT_TYPES }) type!: (typeof ATTACHMENT_TYPES)[number];
  @ApiProperty() filename!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ required: false, nullable: true }) sizeBytes!: number | null;
  @ApiProperty() createdAt!: Date;
}
