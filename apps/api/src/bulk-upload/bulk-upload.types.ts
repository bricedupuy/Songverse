import type { BulkUploadTypeValue } from "./dto/bulk-upload-commit.dto";

/**
 * BullMQ job payload - deliberately small (references, not bytes). The
 * file itself is already written to object storage by the time this is
 * enqueued (see BulkUploadService.commit()), so the queue only ever
 * carries what's needed to find it again plus enough metadata to create
 * the Attachment row. Keeping raw file bytes out of Redis is what lets
 * this scale to thousands of files per batch.
 */
export interface BulkUploadJobData {
  songbookId: string;
  entryCode: string;
  type: BulkUploadTypeValue;
  filename: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
}

export const BULK_UPLOAD_QUEUE = "bulk-upload";
