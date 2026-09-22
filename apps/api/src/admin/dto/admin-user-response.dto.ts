import { ApiProperty } from "@nestjs/swagger";

export class AdminUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() isGlobalAdmin!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() teamCount!: number;
  @ApiProperty() songCount!: number;
}
