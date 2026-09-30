import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SaveFileSizeLimitsSchema } from "@songverse/core";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard.js";
import { zodDto } from "../common/zod-validation.js";
import { getFileSizeLimits, saveFileSizeLimits } from "./file-size-limits.js";

class SaveFileSizeLimitsDto extends zodDto(SaveFileSizeLimitsSchema) {}

/** The largest song file of each type (issue #163): for the app to check a file before sending it. */
@ApiTags("attachments")
@ApiBearerAuth()
@Controller("uploads")
export class UploadsController {
  @Get("limits")
  async limits() {
    return { limitsMb: (await getFileSizeLimits()).limitsMb };
  }
}

/** Admin > Storage > File size limits. */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/storage/file-size-limits")
@UseGuards(GlobalAdminGuard)
export class AdminFileSizeLimitsController {
  @Get()
  get(): ReturnType<typeof getFileSizeLimits> {
    return getFileSizeLimits();
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  save(@Body() dto: SaveFileSizeLimitsDto): Promise<void> {
    return saveFileSizeLimits(dto.limitsMb);
  }
}
