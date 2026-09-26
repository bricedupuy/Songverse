import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { METADATA_PROVIDERS } from "@songverse/core";

export class MetadataSourceRefDto {
  @IsIn(METADATA_PROVIDERS)
  provider!: (typeof METADATA_PROVIDERS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id!: string;
}

/** A match chosen in Auto detect (issue #22): its sources, looked up again. */
export class LinkMetadataDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(METADATA_PROVIDERS.length)
  @ValidateNested({ each: true })
  @Type(() => MetadataSourceRefDto)
  sources!: MetadataSourceRefDto[];
}
