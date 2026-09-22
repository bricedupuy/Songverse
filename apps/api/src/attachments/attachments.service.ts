import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { AttachmentTypeValue } from "./dto/upload-attachment.dto";

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  listForSongVersion(songVersionId: string) {
    return this.prisma.client.attachment.findMany({
      where: { songVersionId },
      orderBy: { createdAt: "desc" },
    });
  }

  async upload(songVersionId: string, type: AttachmentTypeValue, filename: string, mimeType: string, body: Buffer) {
    const { hash, sizeBytes } = await this.storage.put(body, mimeType);
    return this.prisma.client.attachment.create({
      data: { songVersionId, type, filename, mimeType, storageKey: hash, sizeBytes },
    });
  }

  async download(songVersionId: string, attachmentId: string): Promise<{ attachment: { filename: string; mimeType: string }; body: Buffer }> {
    const attachment = await this.findOwnedAttachment(songVersionId, attachmentId);
    const body = await this.storage.get(attachment.storageKey);
    return { attachment, body };
  }

  /**
   * Deletes the Attachment row, then deletes the underlying object only if
   * no other Attachment (in this or any other song version) still
   * references the same content hash - see docs/songbooks-and-catalog.md
   * §8. Checked on demand rather than via a maintained counter, which
   * could drift out of sync with the actual row count.
   */
  async remove(songVersionId: string, attachmentId: string): Promise<void> {
    const attachment = await this.findOwnedAttachment(songVersionId, attachmentId);
    await this.prisma.client.attachment.delete({ where: { id: attachment.id } });

    const stillReferenced = await this.prisma.client.attachment.count({
      where: { storageKey: attachment.storageKey },
    });
    if (stillReferenced === 0) {
      await this.storage.delete(attachment.storageKey);
    }
  }

  private async findOwnedAttachment(songVersionId: string, attachmentId: string) {
    const attachment = await this.prisma.client.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.songVersionId !== songVersionId) {
      throw new NotFoundException("Attachment not found");
    }
    return attachment;
  }
}
