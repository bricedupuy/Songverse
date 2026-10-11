import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { JOB_WORKER_OPTIONS, TEAM_EVENTS_QUEUE } from "../jobs/jobs.constants.js";
import { RemindersService } from "./reminders.service.js";
import { TeamEventsService } from "./team-events.service.js";

export const SETS_SCHEDULER_ID = "make-event-sets";
/** The reminders due (issue #235): every hour, so "from 18:00" is kept within the hour. */
export const REMINDERS_SCHEDULER_ID = "event-reminders";
const HOUR_MS = 60 * 60 * 1000;

/**
 * Every few hours (issue #235): the sets of every team's coming event
 * dates, as far ahead as each team says. Every hour: the reminders due.
 */
@Processor(TEAM_EVENTS_QUEUE, JOB_WORKER_OPTIONS)
export class TeamEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(TeamEventsProcessor.name);

  constructor(
    private readonly events: TeamEventsService,
    private readonly reminders: RemindersService,
  ) {
    super();
  }

  async process(job: Job): Promise<{ made: number } | { dayBefore: number; deadlines: number }> {
    if (job.name === REMINDERS_SCHEDULER_ID) return this.reminders.runReminders();
    const made = await this.events.makeAllSets();
    if (made > 0) this.logger.log(`Made ${made} event set(s)`);
    return { made };
  }
}

/** Registers the schedule; upsertJobScheduler is idempotent, so every process registering it leaves one. */
@Injectable()
export class TeamEventsScheduler implements OnModuleInit {
  constructor(@InjectQueue(TEAM_EVENTS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // Every 6 hours: a date comes into range on its own day, whatever the team's time zone.
    await this.queue.upsertJobScheduler(SETS_SCHEDULER_ID, { every: 6 * HOUR_MS }, { name: SETS_SCHEDULER_ID });
    await this.queue.upsertJobScheduler(REMINDERS_SCHEDULER_ID, { every: HOUR_MS }, { name: REMINDERS_SCHEDULER_ID });
  }
}
