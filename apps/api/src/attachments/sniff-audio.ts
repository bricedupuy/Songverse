/**
 * An audio file's type from its first bytes, for uploads the browser gave no
 * audio type (.opus files often come as application/octet-stream). Null when
 * it isn't one of the formats below.
 */
export function sniffAudioType(bytes: Buffer): string | null {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString("latin1");
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(4, 8) === "ftyp") return "audio/mp4";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "audio/webm";
  return null;
}
