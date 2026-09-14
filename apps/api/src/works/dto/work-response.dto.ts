import { ApiProperty } from "@nestjs/swagger";

export class WorkResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ required: false, nullable: true }) preferredOriginalVersionId!: string | null;
  @ApiProperty({ required: false, nullable: true }) title!: string | null;
  @ApiProperty() createdAt!: Date;
}
