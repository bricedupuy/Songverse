/**
 * pdf.js, loaded when needed (it's big), with its worker - after the
 * newest JavaScript it relies on and not every browser has yet:
 * Map/WeakMap's getOrInsert and getOrInsertComputed (issue #152; Safari and
 * Chromium before 2026 lack them, and drawing a page needs them).
 */
export async function loadPdfjs() {
  for (const Kind of [Map, WeakMap] as unknown as { prototype: Record<string, unknown> & { has(key: unknown): boolean; get(key: unknown): unknown; set(key: unknown, value: unknown): unknown } }[]) {
    const proto = Kind.prototype;
    if (typeof proto.getOrInsertComputed !== "function") {
      Object.defineProperty(proto, "getOrInsertComputed", {
        configurable: true,
        writable: true,
        value(this: typeof proto, key: unknown, compute: (key: unknown) => unknown) {
          if (!this.has(key)) this.set(key, compute(key));
          return this.get(key);
        },
      });
    }
    if (typeof proto.getOrInsert !== "function") {
      Object.defineProperty(proto, "getOrInsert", {
        configurable: true,
        writable: true,
        value(this: typeof proto, key: unknown, value: unknown) {
          if (!this.has(key)) this.set(key, value);
          return this.get(key);
        },
      });
    }
  }
  const [pdfjs, { default: workerUrl }] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}
