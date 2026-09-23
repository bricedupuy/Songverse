import { Module } from "@nestjs/common";
import { StorageQuotaService } from "./storage-quota.service";
import { StorageService } from "./storage.service";

@Module({
  providers: [StorageService, StorageQuotaService],
  exports: [StorageService, StorageQuotaService],
})
export class StorageModule {}
