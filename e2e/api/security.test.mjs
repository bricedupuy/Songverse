// How the API protects itself (issue #113): rate limits per signed-in user
// and per address, tighter on the expensive routes, a 429 with Retry-After
// over them - one user's burst never limiting another - and the API's docs
// for global admins only, all set in Admin > Security.
import { API, call, check, finish, sql, user } from "../lib/harness.mjs";

const admin = await user("Security admin");
sql(`update "User" set "isGlobalAdmin"=true where id='${admin.id}'`);
const busy = await user("Busy");
const calm = await user("Calm");

let r = await call(busy, "PUT", "/admin/security", { rateLimitEnabled: true });
check("only global admins change it", r.status === 403, String(r.status));
r = await call(admin, "PUT", "/admin/security", { rateLimitPerMinute: 5 });
check("limits have a floor", r.status === 400, String(r.status));

try {
  r = await call(admin, "PUT", "/admin/security", { rateLimitEnabled: true, rateLimitPerMinute: 25, rateLimitAnonymousPerMinute: 15, rateLimitHeavyPerMinute: 3, apiDocsPublic: false });
  check("saved", r.status === 204, String(r.status));
  r = await call(admin, "GET", "/admin/security");
  check(
    "read back, each setting saying where it comes from",
    r.body.source === "database" && r.body.settings.rateLimitPerMinute.value === 25 && r.body.settings.rateLimitPerMinute.source === "database" && r.body.settings.trustedProxies.source !== "database",
    JSON.stringify(r.body),
  );

  // A burst: the 26th request of the minute is refused, with when to try again.
  let refused = null;
  for (let i = 0; i < 30 && !refused; i++) {
    const res = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${busy.bearer}` } });
    if (res.status === 429) refused = { at: i + 1, retryAfter: Number(res.headers.get("retry-after")), body: await res.json() };
  }
  check("over the limit: 429", refused?.at === 26, JSON.stringify(refused));
  check("with Retry-After, and a message", refused?.retryAfter > 0 && refused.retryAfter <= 60 && /Too many requests/.test(refused.body.message[0]), JSON.stringify(refused));
  r = await call(calm, "GET", "/users/me");
  check("another user isn't affected", r.status === 200, String(r.status));

  // The expensive routes: a tighter limit of their own.
  const joins = [];
  for (let i = 0; i < 4; i++) joins.push((await call(calm, "POST", `/teams/join/nothing-${i}`)).status);
  check("joins by link: the 4th of the minute refused", joins.slice(0, 3).every((status) => status !== 429) && joins[3] === 429, JSON.stringify(joins));

  // Before signing in: per address.
  const anonymous = [];
  for (let i = 0; i < 16; i++) anonymous.push((await fetch(`${API}/set-invites/nothing-${i}`)).status);
  check("per address before signing in", anonymous.slice(0, 15).every((status) => status !== 429) && anonymous[15] === 429, JSON.stringify(anonymous));

  // Addresses the API signed (images, file links) aren't counted.
  r = await fetch(`${API}/health`);
  check("the health check never is", r.status === 200, String(r.status));

  // The docs: global admins only.
  r = await fetch(`${API}/api/docs-json`);
  check("the API's docs hidden from others", r.status === 404, String(r.status));
  r = await fetch(`${API}/api/docs-json`, { headers: { cookie: admin.cookie } });
  check("shown to a global admin, signed in", r.status === 200 && (await r.json()).openapi?.startsWith("3.1"), String(r.status));
} finally {
  r = await call(admin, "DELETE", "/admin/security");
  check("back to the environment", r.status === 204, String(r.status));
}
r = await call(admin, "GET", "/admin/security");
check("nothing saved any more", r.body.source !== "database", JSON.stringify(r.body.source));

finish();
