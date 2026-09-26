// Songverse's service worker (issue #49, docs/offline.md "The app itself").
//
// It keeps the app's code and an app shell - a page that boots the app in
// the browser without the server - so Songverse opens offline. Online,
// nothing changes: pages are still drawn on the server.
//
// server.mjs serves this file with BUILD and PRECACHE filled in for the
// running build, so each deploy is a new service worker: it installs in
// the background and takes over on the next launch (when every Songverse
// tab has closed), never in the middle of a performance. In development
// (Vite serving this file as is) they stay placeholders and it does nothing.

const BUILD = "__SONGVERSE_BUILD__";
const PRECACHE = ["__SONGVERSE_PRECACHE__"];

const ENABLED = !BUILD.startsWith("__");
const CACHE = `songverse-app-${BUILD}`;
const SHELL = "/_shell";
// A network that hangs (a venue's Wi-Fi) counts as down after this long.
const NAVIGATION_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  if (!ENABLED) return;
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([SHELL, ...PRECACHE])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("songverse-app-") && key !== CACHE) await caches.delete(key);
      }
      // The first install takes the open page, so it works offline without a reload.
      await self.clients.claim();
    })(),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function page(request) {
  try {
    const response = await Promise.race([fetch(request), timeout(NAVIGATION_TIMEOUT_MS)]);
    // The server itself down (a deploy, a crash): the shell rather than an error page.
    if (response.status < 500) return response;
  } catch {
    // Offline, or no answer in time.
  }
  return (await caches.match(SHELL, { cacheName: CACHE })) ?? Response.error();
}

async function cached(request) {
  const hit = await caches.match(request, { cacheName: CACHE });
  if (hit) return hit;
  const response = await fetch(request);
  // Content-hashed, so a copy never goes stale.
  if (response.ok && new URL(request.url).pathname.startsWith("/assets/")) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (!ENABLED) return;
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(page(request));
    return;
  }
  if (url.pathname.startsWith("/assets/") || PRECACHE.includes(url.pathname)) event.respondWith(cached(request));
});
