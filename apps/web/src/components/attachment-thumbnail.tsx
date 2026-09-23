import { useEffect, useState } from "react";
import { apiClient } from "#/lib/api-client";

const THUMBNAIL_PX = 40;

/**
 * Attachment files need the Bearer token, which an <img src> can't send, so
 * the resized rendition is fetched and shown from an object URL instead.
 */
export function AttachmentThumbnail({ songVersionId, attachmentId, alt }: { songVersionId: string; attachmentId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    apiClient
      .getAttachmentImage(songVersionId, attachmentId, THUMBNAIL_PX * 2)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      // A file saved as IMAGE that isn't a decodable image just gets no thumbnail.
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [songVersionId, attachmentId]);

  return url ? (
    <img src={url} alt={alt} className="size-10 shrink-0 rounded-md border object-cover" />
  ) : (
    <span className="size-10 shrink-0 rounded-md bg-muted" aria-hidden />
  );
}
