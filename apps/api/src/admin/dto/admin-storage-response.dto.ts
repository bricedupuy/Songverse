import { ApiProperty } from "@nestjs/swagger";

export class AdminStorageResponseDto {
  @ApiProperty({ enum: ["s3", "local"], description: "Which ObjectStorageDriver is currently serving uploads" })
  driver!: "s3" | "local";
  @ApiProperty() attachmentCount!: number;
  @ApiProperty() totalBytes!: number;
  @ApiProperty({
    description: "Attachment count grouped by type",
    type: "object",
    additionalProperties: { type: "number" },
  })
  byType!: Record<string, number>;
}
