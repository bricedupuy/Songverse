import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { isCalendarDate } from "@songverse/core";
import { BadRequestException } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { TeamAdminGuard } from "../common/guards/team-admin.guard.js";
import { TeamMemberGuard } from "../common/guards/team-member.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { CreateTeamEventDto, TeamEventDatesQueryDto, UpdateTeamCalendarDto, UpdateTeamEventDateDto, UpdateTeamEventDto } from "./dto/team-events.dto.js";
import { TeamEventsService } from "./team-events.service.js";

function dateParam(date: string): string {
  if (!isCalendarDate(date)) throw new BadRequestException(["date must be a date, YYYY-MM-DD"]);
  return date;
}

/**
 * A team's calendar (issue #235): every member sees it; its admins manage
 * the events, change or cancel a date, and choose how far ahead the dates'
 * sets are made.
 */
@ApiTags("team calendar")
@ApiBearerAuth()
@Controller("teams/:teamId")
export class TeamEventsController {
  constructor(private readonly events: TeamEventsService) {}

  @Get("events")
  @UseGuards(TeamMemberGuard)
  list(@Param("teamId") teamId: string) {
    return this.events.list(teamId);
  }

  /** The team's dates in a range (at most 400 days), every event's, in time order, with their sets. */
  @Get("event-dates")
  @UseGuards(TeamMemberGuard)
  dates(@Param("teamId") teamId: string, @Query() query: TeamEventDatesQueryDto) {
    return this.events.dates(teamId, query.from, query.to);
  }

  @Post("events")
  @UseGuards(TeamAdminGuard)
  create(@CurrentUser() user: AuthenticatedUser | undefined, @Param("teamId") teamId: string, @Body() dto: CreateTeamEventDto) {
    if (!user) throw new UnauthorizedException();
    return this.events.create(teamId, user.id, dto);
  }

  @Get("events/:eventId")
  @UseGuards(TeamMemberGuard)
  get(@Param("teamId") teamId: string, @Param("eventId") eventId: string) {
    return this.events.get(teamId, eventId);
  }

  @Patch("events/:eventId")
  @UseGuards(TeamAdminGuard)
  update(@Param("teamId") teamId: string, @Param("eventId") eventId: string, @Body() dto: UpdateTeamEventDto) {
    return this.events.update(teamId, eventId, dto);
  }

  /** Coming dates' sets still empty go with it; the others stay as the team's sets. */
  @Delete("events/:eventId")
  @UseGuards(TeamAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("teamId") teamId: string, @Param("eventId") eventId: string) {
    return this.events.remove(teamId, eventId);
  }

  @Patch("events/:eventId/dates/:date")
  @UseGuards(TeamAdminGuard)
  updateDate(@Param("teamId") teamId: string, @Param("eventId") eventId: string, @Param("date") date: string, @Body() dto: UpdateTeamEventDateDto) {
    return this.events.updateDate(teamId, eventId, dateParam(date), dto);
  }

  /** A date's set now, however far ahead: to plan it. */
  @Post("events/:eventId/dates/:date/set")
  @UseGuards(TeamAdminGuard)
  ensureSet(@Param("teamId") teamId: string, @Param("eventId") eventId: string, @Param("date") date: string) {
    return this.events.ensureDateSet(teamId, eventId, dateParam(date));
  }

  @Get("calendar-settings")
  @UseGuards(TeamMemberGuard)
  settings(@Param("teamId") teamId: string) {
    return this.events.calendarSettings(teamId);
  }

  @Put("calendar-settings")
  @UseGuards(TeamAdminGuard)
  updateSettings(@Param("teamId") teamId: string, @Body() dto: UpdateTeamCalendarDto) {
    return this.events.updateCalendarSettings(teamId, dto);
  }
}
