// Production server. `vite preview` (used previously) is explicitly a
// preview/dev tool — it serves static assets with `Cache-Control: no-cache`,
// so every visitor's browser re-fetches the stylesheet on every page load
// instead of caching it. Over real network latency that shows up as a
// flash of unstyled content before the CSS arrives; imperceptible on
// localhost, which is why it wasn't caught until testing against the
// actual deployed domain. This replaces it with a small real server that
// caches Vite's content-hashed /assets/* files forever (safe, since a new
// build gets new hashes) and defers everything else to the built SSR
// handler.
import { createServer } from "node:http";
import { createServerAdapter } from "@whatwg-node/server";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, sep } from "node:path";
import { redirectToWebUrl } from "./redirect-hosts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = join(__dirname, "dist", "client");

// __root.tsx imports the stylesheet as `app.css?url`, which Vite resolves
// separately in the client build and the SSR build (two independent Rollup
// passes — see the "building client environment" / "building ssr
// environment" lines in `vite build` output). Nothing guarantees Tailwind's
// generated CSS is byte-identical across those two passes, so the
// content-hashed filename baked into the SSR-rendered <link> tag can point
// at a file that was never actually written to dist/client/assets (a 404
// in production, seen and confirmed on songverse.one 2026-09-16 — the SSR
// bundle referenced app-DxESX405.css while only app-Cg7lp79W.css existed on
// disk, reproduced even on a from-scratch `docker build --no-cache`). Read
// the filename Vite actually emitted and correct any stale reference to it.
const actualAppCssHref = await (async () => {
  const assetsDir = join(clientDir, "assets");
  const files = await readdir(assetsDir).catch(() => []);
  const match = files.find((f) => /^app-.*\.css$/.test(f));
  return match ? `/assets/${match}` : null;
})();
const staleAppCssPattern = /\/assets\/app-[^"'.]*\.css/g;

const MIME_TYPES = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};

async function tryServeStatic(pathname) {
  const resolved = join(clientDir, pathname);
  // Guard against path traversal escaping dist/client.
  if (!(resolved + sep).startsWith(clientDir + sep) && resolved !== clientDir) return null;

  let fileStat;
  try {
    fileStat = await stat(resolved);
  } catch {
    return null;
  }
  if (!fileStat.isFile()) return null;

  const body = await readFile(resolved);
  const headers = new Headers({
    "Content-Type": MIME_TYPES[extname(resolved)] ?? "application/octet-stream",
    "Content-Length": String(fileStat.size),
  });

  // Vite content-hashes everything under /assets/ (a new build gets new
  // filenames), so it's safe to cache forever. Everything else
  // (manifest.webmanifest, sw.js, favicons) keeps the same URL across
  // deploys and must be revalidated instead.
  headers.set(
    "Cache-Control",
    pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  );

  return new Response(body, { headers });
}

const { default: appHandler } = await import("./dist/server/server.js");

const adapter = createServerAdapter(async (request) => {
  const redirect = redirectToWebUrl(request);
  if (redirect) return redirect;

  if (request.method === "GET" || request.method === "HEAD") {
    const { pathname } = new URL(request.url);
    const staticResponse = await tryServeStatic(decodeURIComponent(pathname));
    if (staticResponse) return staticResponse;
  }

  const response = await appHandler.fetch(request);
  if (!actualAppCssHref || !response.headers.get("content-type")?.includes("text/html")) {
    return response;
  }

  const body = await response.text();
  const fixed = body.replace(staleAppCssPattern, actualAppCssHref);
  if (fixed === body) return new Response(body, response);

  const headers = new Headers(response.headers);
  headers.set("Content-Length", String(Buffer.byteLength(fixed)));
  return new Response(fixed, { status: response.status, statusText: response.statusText, headers });
});

const port = Number(process.env.PORT ?? 3000);
createServer(adapter).listen(port, () => {
  console.log(`SongVerse web listening on :${port}`);
});
