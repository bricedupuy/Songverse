import type { ByteRange } from "../storage/object-storage-driver.js";

/**
 * The part of a `size`-byte file an HTTP `Range` header asks for (issue #33):
 * "bytes=0-99", "bytes=100-" or "bytes=-100" (the last 100). Null means the
 * whole file: no header, a malformed one, or several ranges at once, which
 * HTTP lets a server answer with the whole file. "unsatisfiable" (416) is a
 * range that starts past the end.
 */
export function parseByteRange(header: string | undefined, size: number): ByteRange | "unsatisfiable" | null {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match || size === 0) return null;
  const [, from, to] = match;
  if (from === "" && to === "") return null;
  if (from === "") {
    const last = Number(to);
    if (last === 0) return "unsatisfiable";
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  const start = Number(from);
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size) return "unsatisfiable";
  if (end < start) return null;
  return { start, end };
}
