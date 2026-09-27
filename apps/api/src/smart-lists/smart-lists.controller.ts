import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { CreateSmartListDto, UpdateSmartListDto } from "./smart-list.dto.js";
import { SmartListsService } from "./smart-lists.service.js";

/** Saved library filters (issue #58), each user's own. */
@ApiTags("smart-lists")
@ApiBearerAuth()
@Controller("smart-lists")
export class SmartListsController {
  constructor(private readonly smartLists: SmartListsService) {}

  private userId(user: AuthenticatedUser | undefined): string {
    if (!user) throw new UnauthorizedException();
    return user.id;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser | undefined): ReturnType<SmartListsService["list"]> {
    return this.smartLists.list(this.userId(user));
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: CreateSmartListDto): ReturnType<SmartListsService["create"]> {
    return this.smartLists.create(this.userId(user), dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string, @Body() dto: UpdateSmartListDto): ReturnType<SmartListsService["update"]> {
    return this.smartLists.update(this.userId(user), id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string): Promise<void> {
    return this.smartLists.remove(this.userId(user), id);
  }
}
