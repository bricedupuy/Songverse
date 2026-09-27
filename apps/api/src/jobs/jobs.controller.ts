import { Controller, Delete, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard.js";
import { JobsService } from "./jobs.service.js";

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/jobs")
@UseGuards(GlobalAdminGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  /** Who runs background jobs, each queue's counts, and the last jobs (issue #92). */
  @Get()
  status() {
    return this.jobs.status();
  }

  /** Clears the failed jobs (issue #93), once their errors have been read. */
  @Delete("failed")
  clearFailed() {
    return this.jobs.clearFailed();
  }
}
