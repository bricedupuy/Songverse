import { ApiProperty } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsString } from "class-validator";

export class BulkUploadPreviewDto {
  @ApiProperty({ type: String, isArray: true, description: "Filenames only - no content needed for a preview" })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  filenames!: string[];
}
