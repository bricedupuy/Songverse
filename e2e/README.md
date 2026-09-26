# End-to-end suites

API suites (`api/`) call the running API directly; browser suites (`web/`)
drive the running web app with Playwright's Chromium. Every suite signs up
its own users, so they can run against a database that already has data.

## Running them locally

The database needs its migrations and seed applied (`pnpm --filter
@songverse/db exec prisma migrate deploy`, then `pnpm --filter @songverse/db
seed`) - some suites use the built-in global tags.

1. Start Postgres and Redis, then the API and web app, with the API's output
   going to a file - with no email provider configured the API prints the
   emails it would send, and the suites read verification links from there.
   Point the API's song artwork and song info at the suites' stand-ins for
   Apple Music, MusicBrainz and Deezer (`lib/fake-providers.mjs`, which the
   suites that need them start on port 3999):

   ```sh
   ITUNES_SEARCH_URL=http://localhost:3999 MUSICBRAINZ_API_URL=http://localhost:3999/mb/ws/2/ \
     DEEZER_API_URL=http://localhost:3999/deezer pnpm --filter @songverse/api dev > /tmp/api-dev.log 2>&1 &
   pnpm --filter @songverse/web dev &
   ```

2. Run everything, or pick suites:

   ```sh
   pnpm --filter @songverse/e2e e2e              # all
   pnpm --filter @songverse/e2e e2e api          # the API suites
   pnpm --filter @songverse/e2e e2e sets web/share
   ```

The first time, install the browser: `pnpm --filter @songverse/e2e exec playwright install chromium`.

Screenshots of failed browser steps go to `e2e/.artifacts/`.

## Settings

| Variable | Default |
| --- | --- |
| `E2E_API_URL` | `http://localhost:3001` |
| `E2E_WEB_URL` | `http://localhost:3000` |
| `E2E_API_LOG` | `/tmp/api-dev.log` |
| `E2E_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/songverse_dev` |

Test users have emails starting with `e2e-`. `node e2e/purge-users.mjs`
deletes them (and what they own) from the database `E2E_DATABASE_URL` points at.

## Writing a suite

Import what you need from `lib/harness.mjs` - `user()` for a signed-up,
verified user with an API token, `call()`/`api()` for API requests,
`check()` for an API assertion, `stepper(() => page)` for browser steps
that screenshot on failure, `signIn()` for the web app's sign-in form - and
end with `finish()`, which sets the exit code. Name the file
`<name>.test.mjs` and `run.mjs` picks it up.

## Docs screenshots

`docs/screenshots.mjs` isn't a suite: it takes the screenshots for the user
docs, on a fresh database. See [apps/docs/README.md](../apps/docs/README.md).
