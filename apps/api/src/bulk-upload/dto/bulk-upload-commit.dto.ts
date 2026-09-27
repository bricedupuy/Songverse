import { BulkUploadCommitSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export type { BulkUploadTypeValue } from "@songverse/core";

export class BulkUploadCommitDto extends zodDto(BulkUploadCommitSchema) {}
