import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

const BULK_UPLOAD_TYPES = ["CHORDPRO", "PDF"] as const;
export type BulkUploadTypeValue = (typeof BULK_UPLOAD_TYPES)[number];

export class BulkUploadCommitDto {
  @ApiProperty({ enum: BULK_UPLOAD_TYPES, description: "What kind of content every file in this batch is" })
  @IsIn(BULK_UPLOAD_TYPES)
  type!: BulkUploadTypeValue;
}
