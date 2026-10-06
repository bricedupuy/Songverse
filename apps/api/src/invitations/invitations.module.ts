import { Module } from "@nestjs/common";
import { AdminInvitationsController, SignupPassController } from "./invitations.controller.js";
import { InvitationsService } from "./invitations.service.js";

/** Sign-up by invitation only (issue #198); the check itself is in BetterAuth's hook (signup-gate.ts). */
@Module({
  controllers: [AdminInvitationsController, SignupPassController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
