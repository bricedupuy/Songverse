import { Module } from "@nestjs/common";
import { ImagesModule } from "../images/images.module";
import { StorageModule } from "../storage/storage.module";
import { ArtworkController } from "./artwork.controller";
import { ArtworkService } from "./artwork.service";

@Module({
  imports: [ImagesModule, StorageModule],
  controllers: [ArtworkController],
  providers: [ArtworkService],
  exports: [ArtworkService],
})
export class ArtworkModule {}
