import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { StorageSettings } from "@songverse/db";
import { decryptSecret, encryptSecret, maskSecret } from "@songverse/secret-crypto";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { LocalDiskStorageDriver } from "./local-disk-storage.driver";
import type { ObjectStorageDriver } from "./object-storage-driver";
import { S3StorageDriver } from "./s3-storage.driver";

export interface StoredObject {
  hash: string;
  sizeBytes: number;
}

export type StorageDriverName = "s3" | "local";
/** Where the active config came from - shown in the admin Storage panel. */
export type StorageConfigSource = "database" | "env" | "none";

export interface StorageConfigSummary {
  source: StorageConfigSource;
  driver: StorageDriverName;
  hasDatabaseConfig: boolean;
  accountId: string | null;
  accessKeyIdMasked: string | null;
  bucket: string | null;
  endpoint: string | null;
}

export interface SaveStorageConfigInput {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
  endpoint?: string;
}

const SINGLETON_ID = "singleton";

function hasCompleteDbCredentials(
  settings: StorageSettings | null,
): settings is StorageSettings & { r2AccountId: string; r2AccessKeyId: string; r2SecretAccessKeyEnc: string; r2Bucket: string } {
  return !!(settings?.r2AccountId && settings.r2AccessKeyId && settings.r2SecretAccessKeyEnc && settings.r2Bucket);
}

/**
 * Content-addressed object storage (docs/songbooks-and-catalog.md §8):
 * objects are keyed by SHA-256, so re-uploading identical bytes resolves
 * to the same key for free - dedup is a property of the key, not
 * something this service tracks itself.
 *
 * Credentials resolve in this order, freshly on every call rather than
 * cached: admin-managed settings in the database (see StorageSettings),
 * then the R2_* env vars, then local disk. Re-resolving every time (one
 * cheap indexed lookup) instead of caching in memory is deliberate - the
 * API and Worker are separate processes (see Deploy.md), so an in-memory
 * cache in one would go stale the moment an admin updates settings
 * through the other, with no cross-process invalidation to fix it.
 */
@Injectable()
export class StorageService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private loadDbSettings(): Promise<StorageSettings | null> {
    return this.prisma.client.storageSettings.findUnique({ where: { id: SINGLETON_ID } });
  }

  private async resolveDriver(): Promise<{ driver: ObjectStorageDriver; name: StorageDriverName; source: StorageConfigSource }> {
    const dbSettings = await this.loadDbSettings();
    if (hasCompleteDbCredentials(dbSettings)) {
      const secretAccessKey = decryptSecret(dbSettings.r2SecretAccessKeyEnc, this.config.get<string>("SETTINGS_ENCRYPTION_KEY"));
      return {
        driver: new S3StorageDriver({
          accountId: dbSettings.r2AccountId,
          accessKeyId: dbSettings.r2AccessKeyId,
          secretAccessKey,
          bucket: dbSettings.r2Bucket,
          endpoint: dbSettings.r2Endpoint ?? undefined,
        }),
        name: "s3",
        source: "database",
      };
    }

    const accountId = this.config.get<string>("R2_ACCOUNT_ID");
    const accessKeyId = this.config.get<string>("R2_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("R2_SECRET_ACCESS_KEY");
    const bucket = this.config.get<string>("R2_BUCKET");
    if (accountId && accessKeyId && secretAccessKey && bucket) {
      return {
        driver: new S3StorageDriver({ accountId, accessKeyId, secretAccessKey, bucket, endpoint: this.config.get<string>("R2_ENDPOINT") }),
        name: "s3",
        source: "env",
      };
    }

    return {
      driver: new LocalDiskStorageDriver(join(process.cwd(), ".data", "attachments")),
      name: "local",
      source: "none",
    };
  }

  async put(body: Buffer, contentType: string): Promise<StoredObject> {
    const hash = createHash("sha256").update(body).digest("hex");
    const { driver } = await this.resolveDriver();
    await driver.putObject(hash, body, contentType);
    return { hash, sizeBytes: body.length };
  }

  async get(hash: string): Promise<Buffer> {
    const { driver } = await this.resolveDriver();
    return driver.getObject(hash);
  }

  async delete(hash: string): Promise<void> {
    const { driver } = await this.resolveDriver();
    return driver.deleteObject(hash);
  }

  /** Which driver/source is actually serving uploads - surfaced in the admin Storage panel. */
  async describe(): Promise<{ driver: StorageDriverName; source: StorageConfigSource }> {
    const { name, source } = await this.resolveDriver();
    return { driver: name, source };
  }

  async getConfigSummary(): Promise<StorageConfigSummary> {
    const dbSettings = await this.loadDbSettings();
    const hasDb = hasCompleteDbCredentials(dbSettings);
    const envComplete = !!(
      this.config.get<string>("R2_ACCOUNT_ID") &&
      this.config.get<string>("R2_ACCESS_KEY_ID") &&
      this.config.get<string>("R2_SECRET_ACCESS_KEY") &&
      this.config.get<string>("R2_BUCKET")
    );
    const source: StorageConfigSource = hasDb ? "database" : envComplete ? "env" : "none";

    return {
      source,
      driver: source === "none" ? "local" : "s3",
      hasDatabaseConfig: hasDb,
      accountId: dbSettings?.r2AccountId ?? null,
      accessKeyIdMasked: dbSettings?.r2AccessKeyId ? maskSecret(dbSettings.r2AccessKeyId) : null,
      bucket: dbSettings?.r2Bucket ?? null,
      endpoint: dbSettings?.r2Endpoint ?? null,
    };
  }

  /**
   * Partial update, like PATCH: a field left `undefined` keeps its
   * current value (so the admin never has to re-enter the secret key
   * just to change the bucket name); an empty string clears it.
   */
  async saveConfig(input: SaveStorageConfigInput): Promise<void> {
    const encryptedSecret =
      input.secretAccessKey !== undefined
        ? encryptSecret(input.secretAccessKey, this.config.get<string>("SETTINGS_ENCRYPTION_KEY"))
        : undefined;

    await this.prisma.client.storageSettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        r2AccountId: input.accountId || null,
        r2AccessKeyId: input.accessKeyId || null,
        r2SecretAccessKeyEnc: encryptedSecret ?? null,
        r2Bucket: input.bucket || null,
        r2Endpoint: input.endpoint || null,
      },
      update: {
        ...(input.accountId !== undefined && { r2AccountId: input.accountId || null }),
        ...(input.accessKeyId !== undefined && { r2AccessKeyId: input.accessKeyId || null }),
        ...(encryptedSecret !== undefined && { r2SecretAccessKeyEnc: encryptedSecret }),
        ...(input.bucket !== undefined && { r2Bucket: input.bucket || null }),
        ...(input.endpoint !== undefined && { r2Endpoint: input.endpoint || null }),
      },
    });
  }

  async clearConfig(): Promise<void> {
    await this.prisma.client.storageSettings.deleteMany({ where: { id: SINGLETON_ID } });
  }
}
