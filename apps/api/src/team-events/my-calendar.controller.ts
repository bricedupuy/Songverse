import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { AvailabilityService } from "./availability.service.js";
import { CreateAwayDto, MyEventDatesQueryDto, UpdateAwayDto } from "./dto/team-events.dto.js";

/** Someone's own calendar (issue #235): the dates of all their teams, and the days they're away. */
@ApiTags("team calendar")
@ApiBearerAuth()
@Controller("users/me")
export class MyCalendarController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get("event-dates")
  dates(@CurrentUser() user: AuthenticatedUser | undefined, @Query() query: MyEventDatesQueryDto) {
    if (!user) throw new UnauthorizedException();
    return this.availability.myDates(user.id, query.from, query.to);
  }

  @Get("away")
  away(@CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) throw new UnauthorizedException();
    return this.availability.awayList(user.id);
  }

  /** Days away, across all one's teams: every date in them reads Not available unless answered. */
  @Post("away")
  addAway(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: CreateAwayDto) {
    if (!user) throw new UnauthorizedException();
    return this.availability.addAway(user.id, dto);
  }

  @Patch("away/:id")
  updateAway(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string, @Body() dto: UpdateAwayDto) {
    if (!user) throw new UnauthorizedException();
    return this.availability.updateAway(user.id, id, dto);
  }

  @Delete("away/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAway(@CurrentUser() user: AuthenticatedUser | undefined, @Param("id") id: string) {
    if (!user) throw new UnauthorizedException();
    return this.availability.removeAway(user.id, id);
  }
}
