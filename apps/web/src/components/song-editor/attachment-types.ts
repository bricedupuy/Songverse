import type { AttachmentType } from "@songverse/core";

/** What kind of attachment a file is, going by its type and name. */
export function attachmentTypeFor(file: File): AttachmentType {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("audio/")) return "AUDIO";
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (/\.(cho|chordpro|chopro|crd|pro)$/.test(name)) return "CHORDPRO";
  if (/\.(musicxml|mxl|xml)$/.test(name)) return "MUSICXML";
  if (name.endsWith(".abc")) return "ABC_NOTATION";
  if (file.type.startsWith("text/") || name.endsWith(".txt")) return "TEXT";
  return "OTHER";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
