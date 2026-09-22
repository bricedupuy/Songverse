import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { GlobalAdminGuard } from "../common/guards/global-admin.guard";
import { AdminService, type AdminCommandResult } from "./admin.service";
import { AdminStorageResponseDto, StorageConfigResponseDto } from "./dto/admin-storage-response.dto";
import { AdminUserResponseDto } from "./dto/admin-user-response.dto";
import { SaveStorageConfigDto } from "./dto/save-storage-config.dto";

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

  @Get("users")
  @ApiOkResponse({ type: AdminUserResponseDto, isArray: true })
  listUsers(): ReturnType<AdminService["listUsers"]> {
    return this.adminService.listUsers();
  }

  @Get("storage")
  @ApiOkResponse({ type: AdminStorageResponseDto })
  storageStats(): ReturnType<AdminService["storageStats"]> {
    return this.adminService.storageStats();
  }

  @Get("storage/config")
  @ApiOkResponse({ type: StorageConfigResponseDto })
  getStorageConfig(): ReturnType<AdminService["getStorageConfig"]> {
    return this.adminService.getStorageConfig();
  }

  @Put("storage/config")
  @HttpCode(HttpStatus.NO_CONTENT)
  saveStorageConfig(@Body() dto: SaveStorageConfigDto): Promise<void> {
    return this.adminService.saveStorageConfig(dto);
  }

  @Delete("storage/config")
  @HttpCode(HttpStatus.NO_CONTENT)
  clearStorageConfig(): Promise<void> {
    return this.adminService.clearStorageConfig();
  }
}
