# SongVerse — notes for Claude

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
  (see `apps/web/src/lib/auth-settings.ts`'s `getEffectiveAuthSettings()`
  and `apps/api/src/storage/storage.service.ts`'s `resolveDriver()`).
  Resolve fresh on every use rather than caching across calls or
  processes — the API/Worker/Web each run as separate processes with no
  shared memory, so an admin's save through one needs to be visible to
  requests served by another without a restart.
- Partial-update ("PATCH-like") save semantics: a field left `undefined`
  keeps its current value, an empty string clears it.
- A matching Admin page (`apps/web/src/routes/_protected/admin/*.tsx`)
  with a "Currently using: database / env / nothing configured" line, and
  a "Revert to environment variables" action (with a confirm step) beside
  "Save configuration".

If the setting is used only in apps/web (e.g. BetterAuth config, like
`AuthSettings`), the summary/save/clear operations are plain TanStack
Start `createServerFn`s in a `lib/` file, guarded by
`ensureGlobalAdmin()` from `server-auth.ts` — not routed through the
NestJS API. Keep any `createServerFn` used from client-reachable code in
a file that exports *only* `createServerFn` results, calling plain
functions defined in a *different* module for the actual logic — a plain
function living alongside a `createServerFn` in the same file has, in
practice, ended up bundled into the client JS (verified by inspecting
`dist/client` output), dragging in server-only dependencies like Prisma
or `node:crypto`. See `public-auth-flags.ts` vs. `auth-settings.ts`, and
`server-auth.ts` vs. `auth.ts`, for the working split.

If the setting belongs to apps/api (e.g. object storage), it goes through
`AdminController`/`AdminService` there instead.
