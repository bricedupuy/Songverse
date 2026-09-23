import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Every field is optional and independently omittable, so an admin can
 * change just the Google client ID without re-entering the Resend key
 * (which is write-only and never sent back to the client) - see
 * saveAuthConfig()'s partial-update semantics in auth-settings.ts.
 */
export class SaveAuthConfigDto {
  @ApiProperty({ required: false, description: "Write-only - never returned by GET /admin/auth" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  resendApiKey?: string;

  @ApiProperty({ required: false, description: 'e.g. "SongVerse <onboarding@resend.dev>"' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  emailFrom?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  googleClientId?: string;

  @ApiProperty({ required: false, description: "Write-only - never returned by GET /admin/auth" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  googleClientSecret?: string;
}
