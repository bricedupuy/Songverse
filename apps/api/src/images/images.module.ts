import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { ImageService } from "./image.service.js";
import { PicturesController } from "./pictures.controller.js";
import { PictureService } from "./picture.service.js";

@Module({
  imports: [StorageModule],
  controllers: [PicturesController],
  providers: [ImageService, PictureService],
  exports: [ImageService, PictureService],
})
export class ImagesModule {}
