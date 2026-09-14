import { ApiProperty } from "@nestjs/swagger";
import { OWNERSHIP_SCOPES, PUBLICATION_STATES } from "@songverse/core";

export class SongVersionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ required: false, nullable: true }) alternateTitle!: string | null;
  @ApiProperty() language!: string;
  @ApiProperty({ enum: OWNERSHIP_SCOPES }) ownerScope!: (typeof OWNERSHIP_SCOPES)[number];
  @ApiProperty({ enum: PUBLICATION_STATES }) publicationState!: (typeof PUBLICATION_STATES)[number];
  @ApiProperty({ required: false, nullable: true }) ccli!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
