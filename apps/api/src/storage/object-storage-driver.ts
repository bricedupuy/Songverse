/**
 * A content-addressed blob store: objects are looked up and stored purely
 * by their SHA-256 hash (see docs/songbooks-and-catalog.md §8), so a
 * driver never needs to know about deduplication or reference counting -
 * that's handled one layer up, in AttachmentsService, against the
 * Attachment table. putObject() is idempotent by design: uploading a hash
 * that's already stored is safe to call again (and a driver may skip the
 * actual write when it already has the key).
 */
export interface ObjectStorageDriver {
  putObject(hash: string, body: Buffer, contentType: string): Promise<void>;
  getObject(hash: string): Promise<Buffer>;
  deleteObject(hash: string): Promise<void>;
}
