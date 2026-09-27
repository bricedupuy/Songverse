/**
 * Which uploaded files may be shown in the browser rather than downloaded
 * (issue #112). A file's type is what the uploader's browser said, so an
 * HTML, SVG or XML file could carry a script: shown from the API's origin
 * or the web app's, it would run as whoever opened it. Only these types
 * are shown; anything else is a download, as `application/octet-stream`.
 */
const SAFE_EXACT = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "text/plain"]);

/** The type to show a file as, or null when it must be downloaded instead. */
export function inlineSafeType(mimeType: string | null | undefined): string | null {
  const type = (mimeType ?? "").split(";")[0]!.trim().toLowerCase();
  if (SAFE_EXACT.has(type)) return type === "text/plain" ? "text/plain; charset=utf-8" : type;
  if (/^(audio|video)\/[a-z0-9.+-]+$/.test(type)) return type;
  return null;
}
