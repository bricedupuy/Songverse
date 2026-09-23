import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Max, Min, ValidateIf } from "class-validator";

export class StorageLimitsResponseDto {
  @ApiProperty({ description: "Limit applied to users without their own override, in MB" })
  defaultLimitMb!: number;

  @ApiProperty({ description: "True when no default is saved and the built-in one applies" })
  isBuiltIn!: boolean;

  @ApiProperty()
  builtInDefaultMb!: number;
}

export class SaveStorageLimitsDto {
  @ApiProperty({ nullable: true, description: "Null resets to the built-in default" })
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  defaultLimitMb!: number | null;
}
