import { AnswerEventDateSchema, CreateAwaySchema, MyEventDatesQuerySchema, CreateTeamEventSchema, TeamEventDatesQuerySchema, UpdateTeamCalendarSchema, UpdateTeamEventDateSchema, UpdateTeamEventSchema } from "@songverse/core";
import { zodDto } from "../../common/zod-validation.js";

export class CreateTeamEventDto extends zodDto(CreateTeamEventSchema) {}
export class UpdateTeamEventDto extends zodDto(UpdateTeamEventSchema) {}
export class UpdateTeamEventDateDto extends zodDto(UpdateTeamEventDateSchema) {}
export class TeamEventDatesQueryDto extends zodDto(TeamEventDatesQuerySchema) {}
export class UpdateTeamCalendarDto extends zodDto(UpdateTeamCalendarSchema) {}
export class AnswerEventDateDto extends zodDto(AnswerEventDateSchema) {}
export class CreateAwayDto extends zodDto(CreateAwaySchema) {}
export class MyEventDatesQueryDto extends zodDto(MyEventDatesQuerySchema) {}
