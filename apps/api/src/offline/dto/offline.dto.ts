import { OfflineSyncSchema, OfflinePinSchema, OfflineSongsSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export { PIN_KINDS, type PinKind } from "@songverse/core";

export class OfflineSyncDto extends zodDto(OfflineSyncSchema) {}

export class OfflinePinDto extends zodDto(OfflinePinSchema) {}

export class OfflineSongsDto extends zodDto(OfflineSongsSchema) {}
