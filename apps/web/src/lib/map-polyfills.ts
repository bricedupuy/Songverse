/**
 * Map/WeakMap's getOrInsert and getOrInsertComputed, and Math.sumPrecise,
 * the newest JavaScript pdf.js relies on and not every browser has yet (issue #152; Safari and
 * Chromium before 2026 lack them): on the page, and in pdf.js's worker,
 * which reads a streamed PDF's ranges with them (issue #156).
 */
export function installMapPolyfills() {
  // Math.sumPrecise, as new (pdf.js 6 sums with it): a compensated sum, close enough for drawing.
  const math = Math as unknown as { sumPrecise?: (values: Iterable<number>) => number };
  if (typeof math.sumPrecise !== "function") {
    Object.defineProperty(Math, "sumPrecise", {
      configurable: true,
      writable: true,
      value(values: Iterable<number>) {
        let sum = 0;
        let compensation = 0;
        for (const value of values) {
          const next = sum + value;
          compensation += Math.abs(sum) >= Math.abs(value) ? sum - next + value : value - next + sum;
          sum = next;
        }
        return sum + compensation;
      },
    });
  }
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
