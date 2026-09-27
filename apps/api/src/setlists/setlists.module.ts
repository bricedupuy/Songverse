import { Module } from "@nestjs/common";
import { ArrangementsModule } from "../arrangements/arrangements.module.js";
import { OwnershipRequestsController } from "./ownership-requests.controller.js";
import { SetInvitesController } from "./set-invites.controller.js";
import { SetlistAccessService } from "./setlist-access.service.js";
import { SetlistSharingService } from "./setlist-sharing.service.js";
import { SetlistsController } from "./setlists.controller.js";
import { SetlistsService } from "./setlists.service.js";
import { SongOwnershipService } from "./song-ownership.service.js";

@Module({
  imports: [ArrangementsModule],
  controllers: [SetlistsController, SetInvitesController, OwnershipRequestsController],
  providers: [SetlistAccessService, SetlistsService, SetlistSharingService, SongOwnershipService],
  exports: [SetlistsService, SetlistAccessService],
})
export class SetlistsModule {}
