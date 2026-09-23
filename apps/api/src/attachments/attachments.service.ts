import { Injectable, NotFoundException, UnsupportedMediaTypeException } from "@nestjs/common";
import { ImageService, type ProcessedImage } from "../images/image.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageQuotaService } from "../storage/storage-quota.service";
import { StorageService } from "../storage/storage.service";
import type { AttachmentTypeValue } from "./dto/upload-attachment.dto";

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly quota: StorageQuotaService,
    private readonly images: ImageService,
  ) {}

  listForSongVersion(songVersionId: string) {
    return this.prisma.client.attachment.findMany({
      where: { songVersionId },
      orderBy: { createdAt: "desc" },
    });
  }

  async upload(
    uploaderId: string,
    songVersionId: string,
    type: AttachmentTypeValue,
    filename: string,
    mimeType: string,
    body: Buffer,
  ) {
    await this.quota.assertCanStore(uploaderId, body.length);
    const { hash, sizeBytes } = await this.storage.put(body, mimeType);
    return this.prisma.client.attachment.create({
      data: { songVersionId, type, filename, mimeType, storageKey: hash, sizeBytes, uploadedByUserId: uploaderId },
    });
  }

  async download(songVersionId: string, attachmentId: string): Promise<{ attachment: { filename: string; mimeType: string }; body: Buffer }> {
    const attachment = await this.findOwnedAttachment(songVersionId, attachmentId);
    const body = await this.storage.get(attachment.storageKey);
    return { attachment, body };
  }

  /** A resized WebP rendition of an image attachment (see ImageService.resize for sizing rules). */
  async resizedImage(songVersionId: string, attachmentId: string, width: number): Promise<ProcessedImage> {
    const attachment = await this.findOwnedAttachment(songVersionId, attachmentId);
    if (attachment.type !== "IMAGE" && !attachment.mimeType.startsWith("image/")) {
      throw new UnsupportedMediaTypeException("This attachment isn't an image");
    }
    return this.images.resize(attachment.storageKey, () => this.storage.get(attachment.storageKey), width);
  }

  /**
   * Deletes the Attachment row, then deletes the underlying object only if
   * no other Attachment (in this or any other song version) or avatar still
   * references the same content hash - see docs/songbooks-and-catalog.md
   * §8. Checked on demand rather than via a maintained counter, which
   * could drift out of sync with the actual row count.
   */
  async remove(songVersionId: string, attachmentId: string): Promise<void> {
    const attachment = await this.findOwnedAttachment(songVersionId, attachmentId);
    await this.prisma.client.attachment.delete({ where: { id: attachment.id } });
    await this.storage.deleteUnreferenced([attachment.storageKey]);
  }

  private async findOwnedAttachment(songVersionId: string, attachmentId: string) {
    const attachment = await this.prisma.client.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.songVersionId !== songVersionId) {
      throw new NotFoundException("Attachment not found");
    }
    return attachment;
  }
}
