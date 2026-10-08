import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CreateScreenThemeSchema, UpdateScreenThemeSchema } from "@songverse/core";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { zodDto } from "../common/zod-validation.js";
import { ScreenThemesService } from "./screen-themes.service.js";

class CreateScreenThemeDto extends zodDto(CreateScreenThemeSchema) {}
class UpdateScreenThemeDto extends zodDto(UpdateScreenThemeSchema) {}

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw new UnauthorizedException();
  return user;
}

/** Screen themes (issue #194): saved looks for screens, a person's own or a team's. */
@ApiTags("screens")
@ApiBearerAuth()
@Controller("screen-themes")
export class ScreenThemesController {
  constructor(private readonly themes: ScreenThemesService) {}

  @Get()
  @ApiOperation({ summary: "The user's screen themes and their teams'", description: "Each with `canEdit`: theirs, or a team's they're an admin of." })
  list(@CurrentUser() user: AuthenticatedUser | undefined): ReturnType<ScreenThemesService["list"]> {
    return this.themes.list(requireUser(user));
  }

  @Post()
  @ApiOperation({ summary: "A screen theme", description: "The user's own, or with `teamId` a team's they're an admin of. `theme` is a screen-theme/v1 document (docs/screen-theme-v1.md)." })
  create(@Body() dto: CreateScreenThemeDto, @CurrentUser() user: AuthenticatedUser | undefined): ReturnType<ScreenThemesService["create"]> {
    return this.themes.create(requireUser(user), dto);
  }

  @Patch(":themeId")
  @ApiOperation({ summary: "Changes a screen theme", description: "The screens showing it change at once." })
  update(@Param("themeId") themeId: string, @Body() dto: UpdateScreenThemeDto, @CurrentUser() user: AuthenticatedUser | undefined): ReturnType<ScreenThemesService["update"]> {
    return this.themes.update(requireUser(user), themeId, dto);
  }

  @Delete(":themeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Deletes a screen theme", description: "Its screens go back to the default look." })
  remove(@Param("themeId") themeId: string, @CurrentUser() user: AuthenticatedUser | undefined): Promise<void> {
    return this.themes.remove(requireUser(user), themeId);
  }
}
