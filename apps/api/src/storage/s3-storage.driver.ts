import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NotFoundException } from "@nestjs/common";
import { Readable } from "node:stream";
import type { ByteRange, ObjectStorageDriver } from "./object-storage-driver";

const notFound = (error: unknown): never => {
  if (error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound")) {
    throw new NotFoundException("Object not found in storage");
  }
  throw error;
};

export interface S3StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
}

/**
 * R2 is S3-compatible, so the plain AWS SDK client works against it given
 * the account's R2 endpoint - no separate Cloudflare SDK needed.
 */
export class S3StorageDriver implements ObjectStorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject(hash: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: hash, Body: body, ContentType: contentType }),
    );
  }

  async getObject(hash: string): Promise<Buffer> {
    const result = await this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: hash }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "NoSuchKey") {
          throw new NotFoundException("Object not found in storage");
        }
        throw error;
      });
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new NotFoundException("Object not found in storage");
    return Buffer.from(bytes);
  }

  async streamObject(hash: string, range?: ByteRange): Promise<Readable> {
    const result = await this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: hash, Range: range ? `bytes=${range.start}-${range.end}` : undefined }))
      .catch(notFound);
    // In Node the SDK's body is already a Readable.
    if (!(result.Body instanceof Readable)) throw new NotFoundException("Object not found in storage");
    return result.Body;
  }

  async objectSize(hash: string): Promise<number> {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: hash })).catch(notFound);
    return result.ContentLength ?? 0;
  }

  async deleteObject(hash: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: hash }));
  }
}
