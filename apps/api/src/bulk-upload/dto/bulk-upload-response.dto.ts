import { ApiProperty } from "@nestjs/swagger";
import type { BulkUploadMatchStatus } from "@songverse/core";

const BULK_UPLOAD_MATCH_STATUSES: BulkUploadMatchStatus[] = ["MATCHED", "UNMATCHED", "DUPLICATE"];

export class BulkUploadFileMatchDto {
  @ApiProperty() filename!: string;
  @ApiProperty({ required: false, nullable: true }) entryCode!: string | null;
  @ApiProperty({ enum: BULK_UPLOAD_MATCH_STATUSES }) status!: BulkUploadMatchStatus;
}

export class BulkUploadCommitResultDto {
  @ApiProperty({ description: "Number of files queued for background processing" }) queued!: number;
  @ApiProperty({ type: String, isArray: true, description: "Filenames skipped (unmatched or duplicate)" })
  skipped!: string[];
}
