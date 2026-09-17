import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard";
import { AdminService, type AdminCommandResult } from "./admin.service";

/**
 * Operational tools for global admins - today, the migrate/seed steps
 * that used to require shelling into the API container by hand. Meant to
 * grow into a broader "server & API" ops panel over time.
 *
 * Deliberately in-process only (no child_process/shell-exec anywhere in
 * this module): running seed logic in-process is straightforward, but
 * there's no supported non-CLI way to run `prisma migrate deploy`, so
 * applying migrations stays a manual step - this only reports status.
 */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(GlobalAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("migrations/status")
  @ApiOkResponse({ description: "Read-only: compares migrations on disk against what's applied in the DB." })
  migrationStatus(): Promise<AdminCommandResult> {
    return this.adminService.migrationStatus();
  }

  @Post("seed")
  @ApiOkResponse({ description: "Runs the database seed script in-process." })
  runSeed(): Promise<AdminCommandResult> {
    return this.adminService.runSeed();
  }
}
