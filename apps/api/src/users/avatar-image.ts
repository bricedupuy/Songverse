/**
 * Content type of a stored avatar, from its first bytes. New avatars are
 * always WebP (see ImageService.normalizeAvatar); older ones may be any of
 * these formats.
 */
export function detectAvatarImageType(body: Buffer): string | null {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.length >= 6 && ["GIF87a", "GIF89a"].includes(body.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (body.length >= 12 && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}
