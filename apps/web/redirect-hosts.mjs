// Old addresses of the web app, sent on to its current one (#42): when it
// moved from songverse.one to app.songverse.one, links already out there -
// verification and password-reset emails, set share links, claim links,
// bookmarks - still point at the old host.
//
// REDIRECT_HOSTS lists the old hostnames (comma-separated, e.g.
// "songverse.one"); WEB_URL is where the app lives now. Unset, nothing is
// redirected.

/** A permanent redirect to the same path on WEB_URL for a request to one of REDIRECT_HOSTS, else null. */
export function redirectToWebUrl(request, env = process.env) {
  const hosts = (env.REDIRECT_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (hosts.length === 0 || !env.WEB_URL) return null;
  const url = new URL(request.url);
  const host = (request.headers.get("host") ?? url.host).toLowerCase().replace(/:\d+$/, "");
  if (!hosts.includes(host)) return null;
  const target = new URL(url.pathname + url.search, env.WEB_URL);
  // 308 keeps the method and body of anything that isn't a plain page load.
  const status = request.method === "GET" || request.method === "HEAD" ? 301 : 308;
  return new Response(null, { status, headers: { Location: target.href } });
}
