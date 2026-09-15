# Deploying SongVerse

This documents the working deployment of SongVerse to a self-hosted [Dokploy](https://dokploy.com) instance, using `songverse.one` as the domain. Follow this in order if you're setting it up from scratch, or use it as a reference if something needs fixing later.

## Architecture

Five things get created in Dokploy, all in one Project:

| Resource | Type | Built from | Notes |
|---|---|---|---|
| Postgres | Database | Dokploy's built-in template | Shared by API, Worker, and Web |
| Redis | Database | Dokploy's built-in template | Used for background jobs (not active yet in Phase 1) |
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
AUTH_URL=https://songverse.one
PORT=3001
```

### Worker app

**Application**, same source and Dockerfile as the API:
- Dockerfile path: `Dockerfile.api`
- Build context: `.`
- **No domain, no port** — it doesn't serve web traffic
- **Command override** (usually under an "Advanced" tab, field is typically called "Command"): `node dist/worker.js`

Environment variables: same as the API app (`DATABASE_URL`, `REDIS_URL`, `AUTH_URL`). `PORT` isn't used here.

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
DATABASE_URL=<same Postgres connection string as the API>
AUTH_URL=https://songverse.one
API_URL=https://api.songverse.one
BETTER_AUTH_SECRET=<generate one — see below>
PORT=3000
```

**`AUTH_URL` vs `API_URL`, since it's easy to mix up:** `AUTH_URL` is always the **Web app's** own address, on every service that has it — it's where the login system (BetterAuth) actually lives, and the API needs to know it to verify login tokens. `API_URL` is the **API's** address, and only the Web app needs it, so it knows where to send data requests.

**Generating `BETTER_AUTH_SECRET`:**
```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Keep this stable once set — BetterAuth encrypts its signing key with it in the database, so changing the secret without clearing the `Jwks` table breaks login for everyone until you do.

Deploy the API and Worker first, then the Web app (Web's build doesn't strictly depend on the others being up, but it's a sane order).

## 3. Run the database migration (once)

The database exists but is empty. Open a shell into the running **API** container (Dokploy's terminal/exec feature) and run:
```
pnpm --filter @songverse/db exec prisma migrate deploy
```
Run this again any time a new migration is added to the repo — it's safe to re-run, it only applies what's new.

## 4. Verify

- `https://api.songverse.one/health` → `{"status":"ok"}`
- `https://api.songverse.one/api/docs` → interactive API documentation
- `https://songverse.one` → the homepage
- Sign up for an account → should land on `/dashboard`, showing your name and the results of a live call to the API

If all of those work, the deployment is healthy end to end: DNS → HTTPS → Web → Auth → API → Database.

## Gotchas already hit (and fixed in the repo)

These were real failures during the first deploy. The fixes are already committed, but they're documented here in case a future change accidentally reintroduces one of them.

#### 1. Docker build context
Both Dockerfiles live at the **repo root** (`Dockerfile.api`, `Dockerfile.web`), not inside `apps/api/` or `apps/web/`. They need to reach sibling folders (`packages/core`, `packages/db`) during the build, and some platforms — Dokploy included — default the build context to "the directory the Dockerfile is in," ignoring a separately configured context path. Keeping the Dockerfiles at the root sidesteps the ambiguity entirely: wherever the Dockerfile is *is* the context.

#### 2. pnpm version drift
Both Dockerfiles pin pnpm explicitly with `corepack prepare pnpm@10.33.0 --activate` in the base stage, rather than letting corepack lazily resolve a version from `package.json` at first use. Without this, a newer base image's corepack silently fetched pnpm 12 instead of the pinned 10.33.0, and pnpm 12 resolves monorepo workspaces more strictly — breaking the (normal, standard) "copy `package.json` files first, then install" layer-caching pattern both Dockerfiles use.

#### 3. Missing OpenSSL
Both Dockerfiles now `apt-get install openssl` in the base stage. `node:22-slim` doesn't include it, and Prisma's query engine needs it to detect which binary variant to use — without it, Prisma falls back to a guess that happens to work on some hosts and might not on others.

#### 4. `vite preview` blocking the production domain
`apps/web/vite.config.ts` sets `preview.allowedHosts: true`. By default, `vite preview` (which is what serves the Web app in production here — see the comment at the top of `Dockerfile.web` for why) only trusts `localhost`, as a defense meant for a developer's own machine. Behind Dokploy's reverse proxy, that protection is redundant — the proxy already controls which domains reach the container.

#### 5. The API URL must be a runtime value, not baked in at build time
`apps/web/src/lib/public-env.ts` reads `API_URL` from the container's environment at request time, rather than through Vite's `VITE_`-prefixed build-time env inlining. The build-time approach requires the hosting platform to correctly pass a value as a Docker *build argument* specifically (not just a regular env var), which didn't work reliably here. If `/users/me` or similar ever starts failing again with something like `Failed to parse URL from /users/me`, it means `API_URL` isn't set on the Web app's environment variables.

## Redeploying after a code change

Push to `main`, then trigger a rebuild in Dokploy for whichever app(s) changed (API and Worker share an image, so a backend change means rebuilding both). If the change includes a new Prisma migration, re-run the migration command from step 3 after the API redeploys.
