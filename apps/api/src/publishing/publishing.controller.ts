import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { requireUser } from "../setlists/setlists.controller.js";
import {
  ApproveSubmissionDto,
  ListSubmissionsQueryDto,
  MergeSubmissionDto,
  PublishSongDto,
  ResubmitDto,
  ReviewNotesDto,
  SubmitSongDto,
} from "./dto/publishing.dto.js";
import { PublishingService } from "./publishing.service.js";

/** Submitting a song to the global catalogue, from its page. */
@ApiTags("publishing")
@ApiBearerAuth()
@Controller("song-versions/:songVersionId")
export class SongPublishingController {
  constructor(private readonly publishing: PublishingService) {}

  @Get("publication")
  status(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string) {
    return this.publishing.status(requireUser(user), songVersionId);
  }

  @Post("submissions")
  submit(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string, @Body() dto: SubmitSongDto) {
    return this.publishing.submit(requireUser(user), songVersionId, dto);
  }

  /** Global admins only: into the catalogue straight away. */
  @Post("publish")
  publish(@CurrentUser() user: AuthenticatedUser | undefined, @Param("songVersionId") songVersionId: string, @Body() dto: PublishSongDto) {
    return this.publishing.publishDirectly(requireUser(user), songVersionId, dto);
  }
}

/** The review queue, and what submitters and reviewers do with a submission. */
@ApiTags("publishing")
@ApiBearerAuth()
@Controller("submissions")
export class SubmissionsController {
  constructor(private readonly publishing: PublishingService) {}

  /** Reviewers and global admins. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser | undefined, @Query() query: ListSubmissionsQueryDto) {
    return this.publishing.list(requireUser(user), query.state ?? "open");
  }

  @Get("mine")
  mine(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.publishing.mine(requireUser(user));
  }

  @Get(":submissionId")
  findOne(@CurrentUser() user: AuthenticatedUser | undefined, @Param("submissionId") submissionId: string) {
    return this.publishing.findOne(requireUser(user), submissionId);
  }

  @Post(":submissionId/withdraw")
  withdraw(@CurrentUser() user: AuthenticatedUser | undefined, @Param("submissionId") submissionId: string) {
    return this.publishing.withdraw(requireUser(user), submissionId);
  }

  @Post(":submissionId/resubmit")
  resubmit(@CurrentUser() user: AuthenticatedUser | undefined, @Param("submissionId") submissionId: string, @Body() dto: ResubmitDto) {
    return this.publishing.resubmit(requireUser(user), submissionId, dto);
  }

  @Post(":submissionId/start-review")
  startReview(@CurrentUser() user: AuthenticatedUser | undefined, @Param("submissionId") submissionId: string) {
    return this.publishing.startReview(requireUser(user), submissionId);
  }

  @Post(":submissionId/approve")
  approve(@CurrentUser() user: AuthenticatedUser | undefined, @Param("submissionId") submissionId: string, @Body() dto: ApproveSubmissionDto) {
    return this.publishing.approve(requireUser(user), submissionId, dto);
  }

  @Post(":submissionId/merge")
  merge(@CurrentUser() user: AuthenticatedUser | undefined, @Param("submissionId") submissionId: string, @Body() dto: MergeSubmissionDto) {
    return this.publishing.merge(requireUser(user), submissionId, dto);
  }

  @Post(":submissionId/request-changes")
  requestChanges(@CurrentUser() user: AuthenticatedUser | undefined, @Param("submissionId") submissionId: string, @Body() dto: ReviewNotesDto) {
    return this.publishing.requestChanges(requireUser(user), submissionId, dto.notes);
  }

  @Post(":submissionId/reject")
  reject(@CurrentUser() user: AuthenticatedUser | undefined, @Param("submissionId") submissionId: string, @Body() dto: ReviewNotesDto) {
    return this.publishing.reject(requireUser(user), submissionId, dto.notes);
  }
}
