import { ProcessAttachmentSchema, UploadAttachmentSchema, UpdateAttachmentSchema, UseTakeSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export { ATTACHMENT_VISIBILITIES, type AttachmentTypeValue, type AttachmentVisibilityValue } from "@songverse/core";

export class UploadAttachmentDto extends zodDto(UploadAttachmentSchema) {}

export class UpdateAttachmentDto extends zodDto(UpdateAttachmentSchema) {}

export class UseTakeDto extends zodDto(UseTakeSchema) {}

export class ProcessAttachmentDto extends zodDto(ProcessAttachmentSchema) {}
