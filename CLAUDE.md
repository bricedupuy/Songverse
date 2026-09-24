# SongVerse — notes for Claude

## Issues first

Before starting an enhancement or a fix, make sure a GitHub issue describes
it: create one, or update the existing one (the open issues are the plan -
check them before creating a duplicate). Reference it in the commits
(`Closes #n` in the one that finishes it). Once the work is merged to
`main`, close the issue if the merge didn't already, with a comment naming
the commit. Anything planned but not started gets an issue too, so nothing
agreed in a conversation lives only there.

## Keep the Admin UI current

Whenever a change introduces or touches operator-facing configuration
(new env var, feature flag, credential, service toggle, etc.), give it a
home in the Admin UI rather than leaving it env-var-only — don't let the
admin dashboard drift out of sync with what's actually configurable.

Established pattern for admin-editable settings backed by a database
singleton row (see `packages/db/prisma/schema.prisma`'s `StorageSettings`
and `AuthSettings` models):
- A singleton Prisma model, `id` fixed to the literal string `"singleton"`.
- Non-secret fields stored directly; secrets encrypted at rest via
  `@songverse/secret-crypto` (`encryptSecret`/`decryptSecret`), keyed by
  the `SETTINGS_ENCRYPTION_KEY` env var. Never decrypt a secret just to
  display it in a summary — only report whether the database holds one
  (`hasDatabaseXxx: boolean`), and let the UI say "leave blank to keep the
  current one".
- Resolution order: database row → matching env var → hardcoded default
  (see `apps/api/src/auth/auth-settings.ts`'s `getEffectiveAuthSettings()`
  and `apps/api/src/storage/storage.service.ts`'s `resolveDriver()`).
  Resolve fresh on every use rather than caching across calls or
  processes — the API/Worker each run as separate processes with no
  shared memory, so an admin's save through one needs to be visible to
  requests served by another without a restart.
- Partial-update ("PATCH-like") save semantics: a field left `undefined`
  keeps its current value, an empty string clears it.
- A matching Admin page (`apps/web/src/routes/_protected/admin/*.tsx`)
  with a "Currently using: database / env / nothing configured" line, and
  a "Revert to environment variables" action (with a confirm step) beside
  "Save configuration". These pages always call the NestJS API via
  `apiClient` (see `packages/core/src/api-client/index.ts`) - the web app
  has no direct database access at all (see below).

Both `StorageSettings` and `AuthSettings` are managed through
`AdminController`/`AdminService` in `apps/api` (`GET/PUT/DELETE
/admin/storage/*` and `/admin/auth/*`), guarded by `GlobalAdminGuard`.
There's no more "settings only used by the web app, so it skips the API"
case — see the next section for why.

## Song content

`SongVersion.documentJson` is a SongDocument v2 (`docs/song-document-v2.md`):
the music only - sections, lines with chords pinned to characters, the
order it's sung in (`flow`) and a `revision`. Title, credits, rights and
the capo are columns; never copy them into the document.
- Read it with `readSongDocument()` from `@songverse/core` (it also
  upgrades a song still stored as v1), never by casting the JSON.
- Section, line and chord IDs must survive edits. The structured editor
  (`apps/web/src/components/song-editor/structured/`) keeps them itself
  and saves `sections`, turned into a document by
  `songDocumentFromSections(previous, …)`; edited text goes through
  `songDocumentFromText(previous, …)`, which matches the new content to
  the old IDs. Both bump the revision.
- ChordPro is only an import/export format (`sectionsFromText`,
  `songToChordPro`), not how songs are stored.

## Tests

Features are covered end to end by the suites in `e2e/` (API calls and
Playwright browser steps against the running app; CI runs them on every
push to `main`). Add or extend a suite there with each feature or fix -
see `e2e/README.md` - rather than keeping test scripts outside the repo.

## Deleting users

Admin > Users can delete an account, either with everything the user
personally owns or keeping that content behind a one-time transfer link
(`apps/api/src/user-management/`). `UserDeletionService` handles every
relation to `User`, `SongVersion`, `Arrangement`, `Songbook`, `Tag` and `Setlist`
that doesn't cascade on delete. **If you add a model with a foreign key to
any of those without `onDelete: Cascade`/`SetNull`, handle it there too**,
or deleting a user who has such a row will fail with a foreign-key error.
New user-owned content types also need adding to its transfer step
(as `SetlistItem.sharedByUserId` - songs shared into team sets - and
`Submission.submitterId` - songs submitted to the global catalogue - do,
so they follow the songs to their new owner).

Storage objects are content-addressed and shared (attachments and avatars
with identical bytes are one object). Delete them only through
`StorageService.deleteUnreferenced()`, which checks both.

## Where auth lives

BetterAuth is mounted in `apps/api` (`apps/api/src/auth/`, wired up in
`main.ts` via `better-auth/node`'s `toNodeHandler`), not in `apps/web`.
This was a deliberate migration (see git history around
`apps/api/src/auth/better-auth.ts`'s introduction): with a mobile app on
the roadmap, every client should authenticate against the same backend
the API already serves, rather than the web app's own server being a
second, unrelated auth surface.

Consequences worth knowing before touching auth-adjacent code:
- **The web app has zero direct Prisma/`@songverse/db` access.** It talks
  to the API over HTTP for everything, auth included -
  `apps/web/src/lib/server-auth.ts` forwards the incoming request's
  session cookie to `${API_URL}/api/auth/get-session` /
  `/api/auth/token`, rather than calling `auth.api.getSession()`
  in-process. If you find yourself wanting to import `@songverse/db` in
  `apps/web`, that's a sign the logic belongs in `apps/api` instead.
- **`AUTH_URL` is the API's own address; `WEB_URL` is the web app's** -
  easy to get backwards. `WEB_URL` matters because a WebAuthn passkey is
  tied to the browser's origin (the web app), not to wherever the auth
  server lives, and because verification/reset-password redirect links
  point back into the web app, which BetterAuth has to explicitly trust
  via `trustedOrigins` now that it's a different origin.
- **The session cookie is cross-origin (web ↔ API, different
  subdomains).** `advanced.crossSubDomainCookies` with an explicit
  `domain` (the shared parent of `AUTH_URL`/`WEB_URL`, derived in
  `better-auth.ts` - BetterAuth's own default is `AUTH_URL`'s full
  hostname, which the web app can't read) and explicit
  `credentials: true` CORS naming the web app's exact origin (never a
  wildcard) are both required for the cookie to survive the round trip.
  Local dev (both on `localhost`) can't catch a mistake here, since
  cookies ignore ports -
  see Deploy.md's gotcha #6 if sign-in stops persisting after a deploy
  change.
- **`/api/auth/get-session` and `/api/auth/token` are exempt from
  BetterAuth's rate limiter** (`rateLimit.customRules` in
  `better-auth.ts`). The web app's *server* calls them on every user's
  behalf, so they'd all share that server's one per-IP bucket (100 per
  10s by default, production only - it's off in dev, so local testing
  won't show it), and a few quick page changes by anyone locked everyone
  out with "Missing bearer token". Relatedly, `apps/web/src/lib/api-client.ts`
  reuses one API token until shortly before it expires (browser) or per
  page render (server) - keep it that way rather than minting a token per
  API call.
- **`isGlobalAdmin`/`locale` are BetterAuth `additionalFields` with
  `input: false`.** They come back for free on `/api/auth/get-session`'s
  `user` object (so the web app doesn't need a second call to
  `/users/me` just to build a session), and `input: false` makes
  BetterAuth's own update-user endpoint reject any client attempt to set
  them directly - the only legitimate way to set `isGlobalAdmin` is the
  `databaseHooks.user.create.after` bootstrap-admin-emails hook, or a
  dedicated API endpoint that itself re-derives authorization first.
- **If you touch `apps/api/src/auth/better-auth.ts` or `main.ts`'s auth
  mount**, keep `apps/api/tsconfig.json`'s `declaration: false`. Without
  it, `tsc` demands every type nested in BetterAuth's inferred config
  (several of which sit behind subpath `exports` maps that classic
  `moduleResolution: "Node"` can't follow) be independently nameable,
  which it structurally can't satisfy - this isn't a style preference,
  the build doesn't type-check without it.
- A `createServerFn` used from client-reachable code must live in a file
  that exports *only* `createServerFn` results, calling plain functions
  defined in a *different* module for the actual logic - a plain function
  living alongside a `createServerFn` in the same file has, in practice,
  ended up bundled into the client JS (verified by inspecting
  `dist/client` output). This mattered most while auth lived in
  `apps/web`; now that it doesn't, `apps/web`'s own server functions
  (`server-auth.ts`) are thin HTTP-forwarding wrappers with no
  Prisma/crypto dependencies to leak in the first place, but the
  discipline still applies to anything else added there later.
