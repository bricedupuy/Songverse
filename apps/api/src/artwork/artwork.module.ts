import { Module } from "@nestjs/common";
import { ImagesModule } from "../images/images.module.js";
import { MetadataModule } from "../metadata/metadata.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { ArtworkController } from "./artwork.controller.js";
import { ArtworkService } from "./artwork.service.js";

@Module({
  imports: [ImagesModule, StorageModule, MetadataModule],
  controllers: [ArtworkController],
  providers: [ArtworkService],
  exports: [ArtworkService],
})
export class ArtworkModule {}
