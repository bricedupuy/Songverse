import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { TEAM_EVENTS_QUEUE } from "../jobs/jobs.constants.js";
import { AvailabilityService } from "./availability.service.js";
import { MyCalendarController } from "./my-calendar.controller.js";
import { TeamEventsController } from "./team-events.controller.js";
import { TeamEventsProcessor, TeamEventsScheduler } from "./team-events.processor.js";
import { TeamEventsService } from "./team-events.service.js";

@Module({
  imports: [BullModule.registerQueue({ name: TEAM_EVENTS_QUEUE })],
  controllers: [TeamEventsController, MyCalendarController],
  providers: [TeamEventsService, AvailabilityService, TeamEventsProcessor, TeamEventsScheduler],
})
export class TeamEventsModule {}
