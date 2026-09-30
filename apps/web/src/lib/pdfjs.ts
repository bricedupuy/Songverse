import { installMapPolyfills } from "./map-polyfills";

let workerPort: Worker | null = null;

/**
 * pdf.js, loaded when needed (it's big), with its worker - both after the
 * newest JavaScript it relies on (lib/map-polyfills.ts): the page's here,
 * the worker's in lib/pdf-worker.ts, which pdf.js's streamed reading of a
 * PDF by ranges needs (issue #156). One worker for every PDF opened.
 */
export async function loadPdfjs() {
  installMapPolyfills();
  const pdfjs = await import("pdfjs-dist");
  workerPort ??= new Worker(new URL("./pdf-worker.ts", import.meta.url), { type: "module" });
  pdfjs.GlobalWorkerOptions.workerPort = workerPort;
  return pdfjs;
}
