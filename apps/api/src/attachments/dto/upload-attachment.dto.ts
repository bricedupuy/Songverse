import { UploadAttachmentSchema, UpdateAttachmentSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export { ATTACHMENT_VISIBILITIES, type AttachmentTypeValue, type AttachmentVisibilityValue } from "@songverse/core";

export class UploadAttachmentDto extends zodDto(UploadAttachmentSchema) {}

export class UpdateAttachmentDto extends zodDto(UpdateAttachmentSchema) {}
