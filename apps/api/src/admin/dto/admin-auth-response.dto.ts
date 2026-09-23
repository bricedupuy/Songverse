import { ApiProperty } from "@nestjs/swagger";

const AUTH_SOURCES = ["database", "env", "none"] as const;

export class AuthConfigResponseDto {
  @ApiProperty({ enum: AUTH_SOURCES, description: "Where the active Resend config came from" })
  emailSource!: (typeof AUTH_SOURCES)[number];
  @ApiProperty() emailFrom!: string;
  @ApiProperty() hasDatabaseResendKey!: boolean;
  @ApiProperty({ enum: AUTH_SOURCES, description: "Where the active Google OAuth config came from" })
  googleSource!: (typeof AUTH_SOURCES)[number];
  @ApiProperty({ required: false, nullable: true }) googleClientId!: string | null;
  @ApiProperty() hasDatabaseGoogleSecret!: boolean;
}
