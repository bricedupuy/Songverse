import { ApiProperty } from "@nestjs/swagger";

export class CatalogEntryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() entryCode!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ required: false, nullable: true }) originalLanguage!: string | null;
  @ApiProperty({ required: false, nullable: true }) composer!: string | null;
  @ApiProperty({ required: false, nullable: true }) author!: string | null;
  @ApiProperty({ required: false, nullable: true }) ccli!: string | null;
}

export class CatalogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ required: false, nullable: true }) abbreviation!: string | null;
  @ApiProperty({ required: false, nullable: true }) publisher!: string | null;
  @ApiProperty({ required: false, nullable: true }) isbn!: string | null;
  @ApiProperty({ required: false, nullable: true }) description!: string | null;
  @ApiProperty({ required: false, nullable: true }) coverImageUrl!: string | null;
  @ApiProperty({ required: false, nullable: true }) officialUrl!: string | null;
  @ApiProperty({ required: false, nullable: true }) language!: string | null;
  @ApiProperty() licensed!: boolean;
  @ApiProperty({ type: CatalogEntryResponseDto, isArray: true, required: false })
  entries?: CatalogEntryResponseDto[];
}

export class ImportCatalogCsvResultDto {
  @ApiProperty() created!: number;
  @ApiProperty() updated!: number;
  @ApiProperty({ type: String, isArray: true }) errors!: string[];
}
