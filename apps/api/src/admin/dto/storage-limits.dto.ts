import { ApiProperty } from "@nestjs/swagger";
import { SaveStorageLimitsSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class StorageLimitsResponseDto {
  @ApiProperty({ description: "Limit applied to users without their own override, in MB" })
  defaultLimitMb!: number;

  @ApiProperty({ description: "True when no default is saved and the built-in one applies" })
  isBuiltIn!: boolean;

  @ApiProperty()
  builtInDefaultMb!: number;
}

/** Null resets to the built-in default. */
export class SaveStorageLimitsDto extends zodDto(SaveStorageLimitsSchema) {}
