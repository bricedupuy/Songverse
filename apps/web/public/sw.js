// PWA shell (Phase 1). No caching strategy yet — offline support for
// songs/arrangements/setlists is Phase 12 (spec §32). This just establishes
// the registration so the app is installable and the SW lifecycle is wired.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
