import { BadRequestException, Injectable, NotFoundException, UnsupportedMediaTypeException } from "@nestjs/common";
import { parseKey, type StemPart } from "@songverse/core";
import type { UpdateAttachmentDto } from "./dto/upload-attachment.dto";
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
    stemPart: StemPart | null = null,
  ) {
    if (stemPart && type !== "AUDIO") throw new BadRequestException("Only audio files can be stems");
    await this.quota.assertCanStore(uploaderId, body.length);
    const { hash, sizeBytes } = await this.storage.put(body, mimeType);
    return this.prisma.client.attachment.create({
      data: { songVersionId, type, filename, mimeType, storageKey: hash, sizeBytes, uploadedByUserId: uploaderId, stemPart },
    });
  }

  /**
   * An audio file's part of the song (a stem, #64) and its recording's key
   * and tempo (#65). What's left out stays; null clears.
   */
  async update(songVersionId: string, attachmentId: string, change: UpdateAttachmentDto) {
    const attachment = await this.findOwnedAttachment(songVersionId, attachmentId);
    const data: { stemPart?: StemPart | null; recordingKey?: string | null; recordingTempo?: number | null } = {};
    if (change.stemPart !== undefined) data.stemPart = change.stemPart;
    if (change.recordingKey !== undefined) {
      // Kept as written ("Gb" stays "Gb"), once it reads as a key.
      const written = change.recordingKey?.trim() ?? "";
      if (written && !parseKey(written)) throw new BadRequestException(`"${written}" isn't a key SongVerse can read`);
      data.recordingKey = written || null;
    }
    if (change.recordingTempo !== undefined) data.recordingTempo = change.recordingTempo;
    if (attachment.type !== "AUDIO" && Object.values(data).some((value) => value !== null)) {
      throw new BadRequestException("Only audio files can be stems or have a recording's key and tempo");
    }
    return this.prisma.client.attachment.update({ where: { id: attachment.id }, data });
  }

  /** One of the song's files, or 404. */
  find(songVersionId: string, attachmentId: string) {
    return this.findOwnedAttachment(songVersionId, attachmentId);
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
