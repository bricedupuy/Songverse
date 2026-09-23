import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const MAX_FILE_CHARS = 10 * 1024 * 1024;

/** A catalogue file (see docs/songbook-catalog-format.md), sent as text. */
export class CatalogFileDto {
  @ApiProperty({ description: "The file's text, CSV or JSON" })
  @IsString()
  @MaxLength(MAX_FILE_CHARS)
  content!: string;

  @ApiProperty({ required: false, description: "Used to tell CSV from JSON; otherwise guessed from the content" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;
}

export class ImportCatalogEntriesDto extends CatalogFileDto {
  @ApiProperty({
    required: false,
    enum: ["merge", "replace"],
    description: "merge (default) adds and updates; replace also removes entries not in the file",
  })
  @IsOptional()
  @IsIn(["merge", "replace"])
  mode?: "merge" | "replace";

  @ApiProperty({ required: false, description: "Only report what would change" })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
