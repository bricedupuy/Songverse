/**
 * The parent domain both apps live under (api.songverse.one +
 * app.songverse.one -> songverse.one), for scoping the session cookie so the
 * web app's own server sees it too. BetterAuth's default when
 * crossSubDomainCookies has no explicit domain is AUTH_URL's full
 * hostname, which would hide the cookie from the web app entirely.
 * `undefined` when both share one host (e.g. localhost in dev), where a
 * plain host-only cookie already reaches both.
 */
export function sharedCookieDomain(a: string, b: string): string | undefined {
  if (a === b) return undefined;
  const bLabels = b.split(".").reverse();
  const shared: string[] = [];
  for (const [i, label] of a.split(".").reverse().entries()) {
    if (label !== bLabels[i]) break;
    shared.push(label);
  }
  if (shared.length < 2) {
    throw new Error(
      `AUTH_URL (${a}) and WEB_URL (${b}) must be subdomains of one parent domain (e.g. api.example.com and ` +
        "example.com) - the session cookie set by the API has to be readable by the web app.",
    );
  }
  return shared.reverse().join(".");
}

/**
 * The passkey relying-party ID: the same parent domain as the session
 * cookie, not the web app's own hostname. WebAuthn lets any subdomain use a
 * parent domain as its ID, and a passkey only works for the ID it was
 * registered with - so pinning it to songverse.one keeps every passkey
 * working when the web app moves between songverse.one and
 * app.songverse.one (#42), or runs on a preview subdomain.
 */
export function passkeyRpId(authHostname: string, webHostname: string): string {
  return sharedCookieDomain(authHostname, webHostname) ?? webHostname;
}
