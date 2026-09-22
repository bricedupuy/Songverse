import { ApiProperty } from "@nestjs/swagger";
import { OWNERSHIP_SCOPES } from "@songverse/core";

export class SongbookEntryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() songVersionId!: string;
  @ApiProperty() entryCode!: string;
  @ApiProperty({ required: false, nullable: true }) songVersionTitle!: string | null;
}

export class SongbookResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ required: false, nullable: true }) abbreviation!: string | null;
  @ApiProperty({ required: false, nullable: true }) language!: string | null;
  @ApiProperty({ required: false, nullable: true }) publisher!: string | null;
  @ApiProperty({ required: false, nullable: true }) year!: number | null;
  @ApiProperty({ enum: OWNERSHIP_SCOPES }) ownerScope!: (typeof OWNERSHIP_SCOPES)[number];
  @ApiProperty({ required: false, nullable: true }) ownerTeamId!: string | null;
  @ApiProperty({ type: SongbookEntryResponseDto, isArray: true, required: false })
  entries?: SongbookEntryResponseDto[];
}
