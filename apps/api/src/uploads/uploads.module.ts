import { Module } from "@nestjs/common";
import { AdminFileSizeLimitsController, UploadsController } from "./uploads.controller.js";

@Module({ controllers: [UploadsController, AdminFileSizeLimitsController] })
export class UploadsModule {}
