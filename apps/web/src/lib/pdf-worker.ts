// pdf.js's worker, after the JavaScript it relies on (issue #156): imports
// run in order, so the polyfills are in before the worker starts.
import "./map-polyfills-install";
import "pdfjs-dist/build/pdf.worker.min.mjs";
