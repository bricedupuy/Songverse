import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import {
  DEFAULT_TRANSFER_RETENTION_DAYS,
  MAX_TRANSFER_RETENTION_DAYS,
} from "../../user-management/content-transfers.service";

/** Each field is optional; omitted fields are left unchanged. */
export class UpdateUserByAdminDto {
  @ApiProperty({ required: false, nullable: true, type: Number, description: "Null clears the override" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  storageLimitMb?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  banned?: boolean;

  @ApiProperty({ required: false, description: "Shown to the user when they try to sign in" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  banReason?: string;
}

export class DeleteUserDto {
  @ApiProperty({ enum: ["delete", "transfer"] })
  @IsIn(["delete", "transfer"])
  contentAction!: "delete" | "transfer";

  @ApiProperty({ required: false, default: DEFAULT_TRANSFER_RETENTION_DAYS })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_TRANSFER_RETENTION_DAYS)
  retentionDays?: number;
}

export class TransferLinkResponseDto {
  @ApiProperty() transferUrl!: string;
  @ApiProperty() expiresAt!: Date;
}
