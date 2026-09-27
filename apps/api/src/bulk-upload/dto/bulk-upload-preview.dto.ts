import { BulkUploadPreviewSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class BulkUploadPreviewDto extends zodDto(BulkUploadPreviewSchema) {}
