import { ApiProperty } from "@nestjs/swagger";
import { TEAM_ROLES } from "@songverse/core";

export class TeamResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ required: false, nullable: true }) description!: string | null;
  @ApiProperty({ enum: TEAM_ROLES, description: "The current user's role on this team" })
  currentUserRole!: (typeof TEAM_ROLES)[number];
}
