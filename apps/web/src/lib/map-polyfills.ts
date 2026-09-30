/**
 * Map/WeakMap's getOrInsert and getOrInsertComputed, the newest JavaScript
 * pdf.js relies on and not every browser has yet (issue #152; Safari and
 * Chromium before 2026 lack them): on the page, and in pdf.js's worker,
 * which reads a streamed PDF's ranges with them (issue #156).
 */
export function installMapPolyfills() {
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
}
