import { ApiProperty } from "@nestjs/swagger";

export class AdminUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() isGlobalAdmin!: boolean;
  @ApiProperty({ description: "From their roles, or their teams'" }) isReviewer!: boolean;
  @ApiProperty({ description: "Their own roles (issue #160)" }) roles!: { id: string; name: string }[];
  @ApiProperty({ description: "The roles their teams give them" }) teamRoles!: { id: string; name: string; teamName: string }[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true, type: Date }) bannedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) banReason!: string | null;
  @ApiProperty({ nullable: true, type: Date, description: "Set while the account awaits a content transfer" })
  deletedAt!: Date | null;
  @ApiProperty({ nullable: true, type: Date }) transferExpiresAt!: Date | null;
  @ApiProperty() usedBytes!: number;
  @ApiProperty({ nullable: true, type: Number, description: "Null means unlimited (global admins)" })
  limitBytes!: number | null;
  @ApiProperty() teamCount!: number;
  @ApiProperty() songCount!: number;
}
