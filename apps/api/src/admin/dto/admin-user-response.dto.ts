import { ApiProperty } from "@nestjs/swagger";

export class AdminUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() isGlobalAdmin!: boolean;
  @ApiProperty() isReviewer!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true, type: Date }) bannedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) banReason!: string | null;
  @ApiProperty({ nullable: true, type: Date, description: "Set while the account awaits a content transfer" })
  deletedAt!: Date | null;
  @ApiProperty({ nullable: true, type: Date }) transferExpiresAt!: Date | null;
  @ApiProperty({ nullable: true, type: Number, description: "Per-user override; null uses the default" })
  storageLimitMb!: number | null;
  @ApiProperty() usedBytes!: number;
  @ApiProperty({ nullable: true, type: Number, description: "Null means unlimited (global admins)" })
  limitBytes!: number | null;
  @ApiProperty() teamCount!: number;
  @ApiProperty() songCount!: number;
}
