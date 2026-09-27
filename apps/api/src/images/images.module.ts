import { Module } from "@nestjs/common";
import { ImageService } from "./image.service.js";

@Module({
  providers: [ImageService],
  exports: [ImageService],
})
export class ImagesModule {}
