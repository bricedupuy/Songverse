# Deploying SongVerse

This documents the working deployment of SongVerse to a self-hosted [Dokploy](https://dokploy.com) instance, using `songverse.one` as the domain. Follow this in order if you're setting it up from scratch, or use it as a reference if something needs fixing later.

## Architecture

Five things get created in Dokploy, all in one Project:

| Resource | Type | Built from | Notes |
|---|---|---|---|
| Postgres | Database | Dokploy's built-in template | Shared by API, Worker, and Web |
| Redis | Database | Dokploy's built-in template | Backs BullMQ background jobs (bulk songbook content upload) — the Worker app must actually be running for these to process |
| API | Application | `Dockerfile.api` | Serves the NestJS API, listens on port 3001 |
| Worker | Application | `Dockerfile.api` (same as API) | Same image as API, different start command — processes background jobs |
| Web | Application | `Dockerfile.web` | The TanStack Start web app, listens on port 3000 |

The API and Worker share one Docker image because they're the same codebase — only the command that starts the container differs.

## 1. DNS

Using deSEC.io (or any DNS host with similar record types):

- **A record**, subname `@` (apex/root) → your server's IP
- **A record**, subname `*` (wildcard) → your server's IP

This covers `songverse.one` and every subdomain (`api.songverse.one`, etc.) with two records.

Verify it resolves before touching Dokploy — cert issuance fails silently if DNS hasn't propagated:
```
dig +short songverse.one
dig +short api.songverse.one
```
Both should print your server's IP.

## 2. Dokploy setup

Create a **Project** to hold everything, then add these five resources.

### Postgres

**Database** → **Postgres**. Set a name and password, deploy it, and copy the connection string it gives you — that's your `DATABASE_URL` for the next three steps.

### Redis

**Database** → **Redis**. Copy its connection string too — that's `REDIS_URL`.

### API app

**Application**, configured as:
- Source: this repo, branch `main`
- Build type: **Dockerfile**
- Dockerfile path: `Dockerfile.api`
- Build context / base directory: `.` (repo root) — see [Gotcha #1](#1-docker-build-context) if this matters to you
- Port: `3001`
- Domain: `api.songverse.one`

Environment variables:
```
DATABASE_URL=<Postgres connection string>
REDIS_URL=<Redis connection string>
PORT=3001

# BetterAuth lives here now (apps/api/src/auth/) - see below.
AUTH_URL=https://api.songverse.one
WEB_URL=https://songverse.one
BETTER_AUTH_SECRET=<generate one — see below>
BOOTSTRAP_ADMIN_EMAILS=<comma-separated emails to auto-promote on sign-up>

SETTINGS_ENCRYPTION_KEY=<any long random string>

# Transactional email (verification + password reset) — fallback only,
# prefer Admin > Auth once the app is up. See below.
RESEND_API_KEY=<Resend API key>
EMAIL_FROM=SongVerse <onboarding@resend.dev>

# Google sign-in — optional, also configurable via Admin > Auth. See below.
GOOGLE_CLIENT_ID=<Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
```

**`AUTH_URL` vs `WEB_URL` vs `API_URL`, since it's easy to mix up:** `AUTH_URL` is this **API's own address** (BetterAuth is mounted here — see `apps/api/src/auth/`). `WEB_URL` is the **web app's** address — needed here because a WebAuthn passkey is tied to the browser's origin (the web app), not to wherever the auth server lives, and because verification/reset-password links redirect back into the web app, which BetterAuth has to explicitly trust as a foreign origin now that it's not the same app. `API_URL` (set on the **Web app only**, below) is this same API's address again, from the web app's point of view, for its ordinary (non-auth) data calls.

**Generating `BETTER_AUTH_SECRET`:**
```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Keep this stable once set — BetterAuth encrypts its signing key with it in the database, so changing the secret without clearing the `Jwks` table breaks login for everyone until you do.

**`RESEND_API_KEY` / `EMAIL_FROM`:** email addresses now have to be verified before sign-in works (`emailAndPassword.requireEmailVerification` in `apps/api/src/auth/better-auth.ts`), and "forgot password" sends a reset link — both go out through [Resend](https://resend.com). Sign up for a free account, verify a sending domain (or use their shared `onboarding@resend.dev` sender for testing), and create an API key. The env vars here are a fallback: once the app is up, sign in as a global admin and set this at **Admin > Auth** instead — it takes effect immediately, no redeploy needed. Whichever path is used, if no Resend API key is configured at all, emails are logged to the container's stdout instead of sent — fine for local dev, **not fine in production** (nobody can verify their account). The app only ever sends these two transactional emails, never bulk/marketing mail, specifically to stay inside the free tier's daily/monthly send cap — don't add new call sites to `apps/api/src/auth/email.ts` without keeping that in mind.

**`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`:** optional, and also settable at **Admin > Auth** instead of these env vars. Leave both unset everywhere to keep email+password (and passkeys) as the only sign-in methods — the "Continue with Google" button only renders once either path is configured. To enable it, create an OAuth 2.0 Client ID at the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with an authorized redirect URI of `<AUTH_URL>/api/auth/callback/google` (e.g. `https://api.songverse.one/api/auth/callback/google`).

**Passkeys** (`@better-auth/passkey`) need no extra configuration — they're derived from `WEB_URL` at boot (the relying-party ID is its hostname), not `AUTH_URL`.

**The session cookie is cross-subdomain by design** (`advanced.crossSubDomainCookies` in `better-auth.ts`): the web app (`songverse.one`) and this API (`api.songverse.one`) are different origins but the same *site* (same registrable domain), so a cookie scoped to `songverse.one` reaches both. That parent domain is derived automatically from `AUTH_URL` and `WEB_URL` (their shared suffix), so the two must be subdomains of one domain you own — the API refuses to start otherwise. Two subdomains of a shared hosting domain (e.g. two different `*.up.railway.app` hosts) won't work either: browsers refuse cookies scoped to a public suffix. This is also why the API's CORS config (`main.ts`) names the web app's exact origin with `credentials: true` rather than using a wildcard — browsers refuse to combine a wildcard `Access-Control-Allow-Origin` with credentialed (cookie-bearing) requests.

**Object storage (R2) has two setup paths** — pick one:

1. **Preferred: Admin > Storage** (in the web app, once it's up). Enter the
   account ID, access key ID, secret access key, and bucket there; it's
   saved in the database (secret access key encrypted with
   `SETTINGS_ENCRYPTION_KEY`) and takes effect immediately, no redeploy or
   env var needed. This requires `SETTINGS_ENCRYPTION_KEY` to be set on
   **both** the API and Worker apps (same value on both — it's what
   decrypts the stored secret), generated with:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. **Fallback: env vars**, only used when nothing has been saved via the
   admin dashboard:
   ```
   R2_ACCOUNT_ID=<Cloudflare account ID>
   R2_ACCESS_KEY_ID=<R2 API token access key ID>
   R2_SECRET_ACCESS_KEY=<R2 API token secret access key>
   R2_BUCKET=songverse
   ```
   `R2_ENDPOINT` is optional — leave it unset and it defaults to
   `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`; only set it if using
   a custom R2 endpoint/domain.

**If neither path is configured**, song attachments (uploaded ChordPro
files, PDF sheet music scans) silently fall back to local disk inside the
container instead of erroring — fine for local dev, **broken in
production**: the API and Worker are separate containers with separate
disks, an upload handled by one won't be visible to the other, and nothing
survives a redeploy either way. Set one of the two paths before anyone
uploads an attachment or runs a bulk content upload for real. Admin >
Storage shows which path is currently active.

### Worker app

**Application**, same source and Dockerfile as the API:
- Dockerfile path: `Dockerfile.api`
- Build context: `.`
- **No domain, no port** — it doesn't serve web traffic
- **Command override** (usually under an "Advanced" tab, field is typically called "Command"): `node dist/worker.js`

Environment variables: same as the API app (`DATABASE_URL`, `REDIS_URL`,
`SETTINGS_ENCRYPTION_KEY`, and the `R2_*` vars if using the env-var
fallback — the Worker is what actually processes bulk content uploads, so
it needs the same object storage config as the API, whichever path you
chose). The Worker never serves HTTP traffic, so it doesn't need
`AUTH_URL`/`WEB_URL`/`BETTER_AUTH_SECRET`/the Resend or Google vars —
those only matter to whichever process BetterAuth's handler is actually
mounted in (the API). `PORT` isn't used here either.

### Web app

**Application**, configured as:
- Source: this repo, branch `main`
- Build type: **Dockerfile**
- Dockerfile path: `Dockerfile.web`
- Build context: `.`
- Port: `3000`
- Domain: `songverse.one`

Environment variables:
```
API_URL=https://api.songverse.one
PORT=3000
```
That's it — the web app no longer talks to Postgres or BetterAuth directly (see the "Where auth lives" note below), so it doesn't need `DATABASE_URL`, `AUTH_URL`, `BETTER_AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, or the Resend/Google vars at all anymore; those all live on the API app now (see above).

Deploy the API and Worker first, then the Web app (Web's build doesn't strictly depend on the others being up, but it's a sane order).

**Where auth lives:** BetterAuth is mounted in `apps/api`, not here — the web app is just another HTTP client of the API for auth, exactly like it already was for every other endpoint. This matters mainly if you're adding a mobile app later: it talks to the same API for both login and data, rather than needing to know about the web app's URL at all. See `apps/api/src/auth/` for the actual auth config, and `apps/web/src/lib/server-auth.ts`/`auth-client.ts` for how the web app calls it.

## 3. Database migrations (automatic)

Nothing to run by hand. The API container applies any pending migrations each time it starts, before serving traffic (see the `CMD` in `Dockerfile.api`), so the first deploy creates the schema and later deploys pick up new migrations. Check the API's startup logs for Prisma's output: either the migrations it applied or `No pending migrations to apply.` If a migration fails, the API won't start and the error will be in those same logs.

The Worker doesn't migrate: its command override (`node dist/worker.js`) replaces the image's start command.

To run migrations manually anyway (e.g. to retry after fixing a failure), open a shell in the running **API** container and run:
```
/repo/packages/db/node_modules/.bin/prisma migrate deploy --schema /repo/packages/db/prisma/schema.prisma
```
Don't use `pnpm --filter @songverse/db exec ...` there: the image doesn't include the pnpm workspace files, so pnpm finds no matching project and silently does nothing.

## 4. Verify

- `https://api.songverse.one/health` → `{"status":"ok"}`
- `https://api.songverse.one/api/docs` → interactive API documentation
- `https://songverse.one` → the homepage
- Sign up for an account → should land on `/dashboard`, showing your name and the results of a live call to the API

If all of those work, the deployment is healthy end to end: DNS → HTTPS → Web → Auth → API → Database.

## Gotchas already hit (and fixed in the repo)

These were real failures during the first deploy. The fixes are already committed, but they're documented here in case a future change accidentally reintroduces one of them.

#### 1. Docker build context
Both Dockerfiles live at the **repo root** (`Dockerfile.api`, `Dockerfile.web`), not inside `apps/api/` or `apps/web/`. They need to reach sibling folders (`packages/*`) during the build, and some platforms — Dokploy included — default the build context to "the directory the Dockerfile is in," ignoring a separately configured context path. Keeping the Dockerfiles at the root sidesteps the ambiguity entirely: wherever the Dockerfile is *is* the context.

#### 2. pnpm version drift
Both Dockerfiles pin pnpm explicitly with `corepack prepare pnpm@10.33.0 --activate` in the base stage, rather than letting corepack lazily resolve a version from `package.json` at first use. Without this, a newer base image's corepack silently fetched pnpm 12 instead of the pinned 10.33.0, and pnpm 12 resolves monorepo workspaces more strictly — breaking the (normal, standard) "copy `package.json` files first, then install" layer-caching pattern both Dockerfiles use.

#### 3. Missing OpenSSL
Both Dockerfiles now `apt-get install openssl` in the base stage. `node:22-slim` doesn't include it, and Prisma's query engine needs it to detect which binary variant to use — without it, Prisma falls back to a guess that happens to work on some hosts and might not on others.

#### 4. `vite preview` blocking the production domain
`apps/web/vite.config.ts` sets `preview.allowedHosts: true`. By default, `vite preview` (which is what serves the Web app in production here — see the comment at the top of `Dockerfile.web` for why) only trusts `localhost`, as a defense meant for a developer's own machine. Behind Dokploy's reverse proxy, that protection is redundant — the proxy already controls which domains reach the container.

#### 5. The API URL must be a runtime value, not baked in at build time
`apps/web/src/lib/public-env.ts` reads `API_URL` from the container's environment at request time, rather than through Vite's `VITE_`-prefixed build-time env inlining. The build-time approach requires the hosting platform to correctly pass a value as a Docker *build argument* specifically (not just a regular env var), which didn't work reliably here. If `/users/me` or similar ever starts failing again with something like `Failed to parse URL from /users/me`, it means `API_URL` isn't set on the Web app's environment variables.

#### 6. Auth's session cookie and CORS have to agree on the exact origin
Since BetterAuth moved into `apps/api`, its session cookie is set by `api.songverse.one` but needs to be usable by pages served from `songverse.one` — a genuinely cross-origin (though same-site) setup. Two things have to be configured together, in `apps/api/src/main.ts` / `auth/better-auth.ts`, or sign-in silently stops persisting:
- CORS must name the web app's **exact** origin (`WEB_URL`) with `credentials: true` — `cors: true` (reflecting any origin) or a wildcard origin cannot be combined with credentialed requests; the browser will drop the cookie.
- BetterAuth's `advanced.crossSubDomainCookies` must be enabled **with an explicit `domain`** of the shared parent (`songverse.one`). Enabling it without one doesn't help: BetterAuth then defaults the domain to `AUTH_URL`'s own hostname (`api.songverse.one`), which the web app still never sees. `better-auth.ts` derives this domain from `AUTH_URL`/`WEB_URL`, so in practice this means those two env vars must be right.

If sign-in appears to succeed (a 200 comes back) but the user is immediately signed out again on the next page load, check these two first — it's almost always one of them, usually caused by `WEB_URL`/`AUTH_URL` being wrong or swapped.

## Redeploying after a code change

Push to `main`, then trigger a rebuild in Dokploy for whichever app(s) changed (API and Worker share an image, so a backend change means rebuilding both). New Prisma migrations apply automatically when the API restarts (see step 3).
