import { Module } from "@nestjs/common";
import { StorageQuotaService } from "./storage-quota.service.js";
import { StorageService } from "./storage.service.js";

@Module({
  providers: [StorageService, StorageQuotaService],
  exports: [StorageService, StorageQuotaService],
})
export class StorageModule {}
