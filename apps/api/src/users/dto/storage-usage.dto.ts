import { ApiProperty } from "@nestjs/swagger";

export class StorageUsageResponseDto {
  @ApiProperty() usedBytes!: number;
  @ApiProperty({ nullable: true, type: Number, description: "Null means unlimited" })
  limitBytes!: number | null;
}
