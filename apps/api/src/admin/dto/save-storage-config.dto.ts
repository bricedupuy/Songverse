import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Every field is optional and independently omittable, so an admin can
 * change just the bucket name without re-entering the secret key (which
 * is write-only and never sent back to the client) - see
 * StorageService.saveConfig()'s partial-update semantics.
 */
export class SaveStorageConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  accountId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  accessKeyId?: string;

  @ApiProperty({ required: false, description: "Write-only - never returned by GET /admin/storage/config" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  secretAccessKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bucket?: string;

  @ApiProperty({ required: false, description: "Custom R2 endpoint URL - leave unset to use the standard one" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  endpoint?: string;
}
