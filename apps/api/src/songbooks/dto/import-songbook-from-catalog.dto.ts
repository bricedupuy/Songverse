import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ImportSongbookFromCatalogDto {
  @ApiProperty({ description: "The SongbookCatalog to import from" })
  @IsString()
  catalogId!: string;

  @ApiProperty({
    required: false,
    description: "Team to own the new songbook under (must be a member). Omit for USER scope, or set global instead.",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({
    required: false,
    description: "Create as a GLOBAL, admin-curated songbook visible to everyone. Global admins only.",
  })
  @IsOptional()
  @IsBoolean()
  global?: boolean;
}
