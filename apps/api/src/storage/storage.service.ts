import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { LocalDiskStorageDriver } from "./local-disk-storage.driver";
import type { ObjectStorageDriver } from "./object-storage-driver";
import { S3StorageDriver } from "./s3-storage.driver";

export interface StoredObject {
  hash: string;
  sizeBytes: number;
}

/**
 * Content-addressed object storage (docs/songbooks-and-catalog.md §8):
 * objects are keyed by SHA-256, so re-uploading identical bytes resolves
 * to the same key for free - dedup is a property of the key, not
 * something this service tracks itself. Falls back to local disk when
 * R2 isn't configured, so attachments work in dev/test without cloud
 * credentials; a real deployment always has the R2_* vars set.
 */
export type StorageDriverName = "s3" | "local";

@Injectable()
export class StorageService {
  private readonly driver: ObjectStorageDriver;
  private readonly driverName: StorageDriverName;
  private readonly logger = new Logger(StorageService.name);

  constructor(config: ConfigService) {
    const accountId = config.get<string>("R2_ACCOUNT_ID");
    const accessKeyId = config.get<string>("R2_ACCESS_KEY_ID");
    const secretAccessKey = config.get<string>("R2_SECRET_ACCESS_KEY");
    const bucket = config.get<string>("R2_BUCKET");

    if (accountId && accessKeyId && secretAccessKey && bucket) {
      this.driver = new S3StorageDriver({
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket,
        endpoint: config.get<string>("R2_ENDPOINT"),
      });
      this.driverName = "s3";
    } else {
      this.logger.warn("R2_* env vars not fully set - using local disk storage for attachments (dev only)");
      this.driver = new LocalDiskStorageDriver(join(process.cwd(), ".data", "attachments"));
      this.driverName = "local";
    }
  }

  /** Which driver is actually serving attachment uploads - surfaced in the admin Storage panel. */
  describe(): { driver: StorageDriverName } {
    return { driver: this.driverName };
  }

  async put(body: Buffer, contentType: string): Promise<StoredObject> {
    const hash = createHash("sha256").update(body).digest("hex");
    await this.driver.putObject(hash, body, contentType);
    return { hash, sizeBytes: body.length };
  }

  get(hash: string): Promise<Buffer> {
    return this.driver.getObject(hash);
  }

  delete(hash: string): Promise<void> {
    return this.driver.deleteObject(hash);
  }
}
