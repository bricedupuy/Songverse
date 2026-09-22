import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ImportCatalogCsvDto {
  @ApiProperty({
    description:
      "Raw CSV text with a header row. Recognized columns: entryCode, title, originalLanguage, composer, author, ccli. " +
      "entryCode and title are required; rows are upserted by entryCode, so re-importing updates existing entries.",
  })
  @IsString()
  @MinLength(1)
  csv!: string;
}
