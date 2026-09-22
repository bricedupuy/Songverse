import { ApiProperty } from "@nestjs/swagger";

const STORAGE_SOURCES = ["database", "env", "none"] as const;

export class AdminStorageResponseDto {
  @ApiProperty({ enum: ["s3", "local"], description: "Which ObjectStorageDriver is currently serving uploads" })
  driver!: "s3" | "local";
  @ApiProperty({ enum: STORAGE_SOURCES, description: "Where the active R2 config came from" })
  source!: (typeof STORAGE_SOURCES)[number];
  @ApiProperty() attachmentCount!: number;
  @ApiProperty() totalBytes!: number;
  @ApiProperty({
    description: "Attachment count grouped by type",
    type: "object",
    additionalProperties: { type: "number" },
  })
  byType!: Record<string, number>;
}

export class StorageConfigResponseDto {
  @ApiProperty({ enum: STORAGE_SOURCES }) source!: (typeof STORAGE_SOURCES)[number];
  @ApiProperty({ enum: ["s3", "local"] }) driver!: "s3" | "local";
  @ApiProperty() hasDatabaseConfig!: boolean;
  @ApiProperty({ required: false, nullable: true }) accountId!: string | null;
  @ApiProperty({ required: false, nullable: true, description: "Last 4 characters only - never the full value" })
  accessKeyIdMasked!: string | null;
  @ApiProperty({ required: false, nullable: true }) bucket!: string | null;
  @ApiProperty({ required: false, nullable: true }) endpoint!: string | null;
}
