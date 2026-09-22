# Songbooks & Songbook Catalog

Status: **all planned items implemented** (see §10). Each section below is
marked with its own status for reference.
This document captures the reasoning behind the Songbooks feature so the "why"
survives past the conversation it was designed in.

## 1. Why

Worship teams commonly organize songs around a specific published songbook or
hymnal, referencing songs by a printed number rather than by title (e.g. "let's
sing JEM 245"). SongVerse needs to model that numbering, while staying on the
right side of copyright: we can freely hold and share *facts* about a
published songbook (its name, publisher, song titles, numbering), but we
cannot redistribute its *content* (lyrics, chords, sheet music, audio) without
rights to do so.

That split — bibliographic metadata vs. copyrighted content — is the same one
Goodreads or Google Books make for regular books, and it's the organizing
principle for everything below.

## 2. Implemented (as of the `Songbook` ownership work)

- `Songbook` — a collection of songs, owned `GLOBAL` (admin-curated, visible
  to everyone), `TEAM` (private to a team, editable by team admins), or
  `USER` (personal, editable only by its creator). Ownership mirrors
  `SongVersion`'s existing `ownerScope`/`ownerUserId`/`ownerTeamId` pattern
  exactly, including a `SongbookOwnerGuard` shaped like
  `SongVersionOwnerGuard`.
- `SongbookEntry` — links a `SongVersion` to a `Songbook` with a free-text
  `entryCode` (e.g. "245", "A-17"). A song can appear in any number of
  songbooks.
- Unlike `SongVersion.findOne` (which has no visibility check — a known gap,
  see §7), `Songbook.findOne` enforces visibility: a `USER`/`TEAM` songbook
  404s for anyone outside its scope.
- Web: songbook list, create form (with an ownership picker), detail page for
  editing metadata and adding/removing entries by searching existing songs.

## 3. Simple vs. Numbered songbooks

**Status: Implemented.**

Not every songbook has a numbering scheme — a personal set list is just an
unordered collection. Plan:

- Add `Songbook.kind: SIMPLE | NUMBERED`.
- Make `SongbookEntry.entryCode` optional, with `@@unique([songbookId,
entryCode])`. Required and enforced unique only when `kind = NUMBERED`
  (Prisma can't express a conditional unique constraint, so this is validated
  in the service layer — the DB constraint itself is harmless for `SIMPLE`
  entries, which just never set a code).

## 4. Sections within a numbered songbook (e.g. JEM1–JEM5)

**Status: Implemented**, including the section filter dropdown on the
songbook detail page.

Some numbered songbooks are published in volumes, with number ranges mapping
to a volume label (JEM 1–371 = "JEM1", 372–721 = "JEM2", etc.).

**Decision: sections are computed, not stored, and are not a global Tag.**

- A `NUMBERED` songbook holds a small ordered list of ranges — `[{ label:
"JEM1", start: 1, end: 371 }, ...]`. Given the list is always small, always
  loaded with its parent, and never queried independently, it's stored as a
  JSON field on `Songbook` rather than a new table (same pattern as
  `Tag.translations` or `User.pedalMappingJson`).
- A song's section label is computed at read time from its entry's numeric
  code falling within a range — never persisted. This means editing a range
  boundary later updates every affected entry's displayed label immediately,
  with nothing to migrate.
- Sections are deliberately *not* modeled as entries in the existing
  `Tag`/`TagCategory` system. Tags are cross-cutting, human-curated
  categorization (theme, style, mood) that mean something on their own; a
  section label only means something in the context of one songbook's
  numbering scheme. Piping it through the global tag system would pollute
  every song's real tags with book-specific numbering artifacts, and that
  problem compounds with every additional numbered songbook a song belongs
  to.
- Labels are free text the songbook owner defines per range (not
  auto-derived from the songbook's abbreviation), since real-world numbering
  isn't always a clean sequence. A default suggestion (`{abbreviation}{n}`)
  can be prefilled as a convenience when adding a new range.
- Entry codes that don't parse as a plain integer (e.g. "A-17") simply don't
  match any range — sections are an optional feature per numbered songbook,
  not a requirement.

## 5. Reverse lookup (which songbooks is this song in?)

**Status: Implemented**, along with a related fix: `SongVersion.findOne` had
no visibility check at all before this (any authenticated user could fetch
any song version by ID). Both now share one `isOwnedByOrMemberOf()` helper
(`apps/api/src/common/utils/ownership-visibility.ts`) for the USER/TEAM
membership check, with each entity handling its own GLOBAL-case nuance
(SongVersion requires `publicationState = APPROVED`; Songbook doesn't have
a moderation state, so GLOBAL is always visible there).

A song can belong to many songbooks. The song's own detail page shows a
"Songbooks" card listing each one it's a member of, with its number (and
computed section, if applicable).

**Privacy constraint that must not be missed**: this reverse query must apply
the same visibility rule as `Songbook.findOne`. If Alice puts a GLOBAL song
in her private personal songbook at #245, a stranger later viewing that same
GLOBAL song must never see "this is #245 in Alice's songbook" — that's
Alice's private organizational scheme, not public information about the song.
The query joins `SongbookEntry` by `songVersionId` instead of `songbookId`,
then filters each result through the existing GLOBAL/TEAM/USER visibility
check before rendering.

## 6. Songbook Catalog (metadata without content)

**Status: Implemented** (catalog + entries CRUD, CSV import, and the lazy
import-from-catalog flow in the second half of this section).

A separate, purely informational layer — think Goodreads/Google Books for
hymnals. Two new models, unrelated to `Songbook`/`SongbookEntry`:

```
SongbookCatalog        — name, publisher, ISBN, description, cover image,
                          official URL, language, licensed flag
SongbookCatalogEntry   — per-song facts only: entry code, title, original
                          language, composer/author attribution, CCLI number
                          if publicly known. Never lyrics, chords, sheet
                          music, or audio.
```

This is intentionally decoupled from the working `Songbook` model — a
catalog entry can exist with zero real songbooks built from it. It exists to
answer "what is JEM, and what songs does it contain," independent of whether
anyone has transcribed those songs into SongVerse yet.

**Sourcing**: no external "hymnal API" exists to pull this from. Initial
population is a CSV import a global admin runs per catalog
(`POST /songbook-catalogs/:catalogId/entries/import-csv`, body `{ csv:
"<raw text>" }`), upserting by entryCode so re-importing updates rather
than duplicates and reporting per-row errors without aborting the whole
batch. Ongoing maintenance (editing entries, adding more one at a time) is
a normal CRUD UI on top, not a one-time-only import. Reading the catalog is
open to any authenticated user (so they can browse what's available before
importing); writing to it is global-admin-only, via the existing
`GlobalAdminGuard`.

#### CSV format

Parsed by the hand-rolled `parseCsvRecords()` in
`apps/api/src/songbook-catalog/parse-csv.ts` (RFC4180-ish — no dependency
pulled in for it):

- **A header row is required.** Recognized column names (case-sensitive,
  whitespace-trimmed): `entryCode`, `title`, `originalLanguage`,
  `composer`, `author`, `ccli`. Order doesn't matter, and any other column
  present is read but ignored.
- **`entryCode` and `title` are required per row** — a row missing either
  is skipped and reported back as an error (`Row N: missing entryCode` /
  `missing title`), by row number counting the header as row 1, without
  aborting the rest of the batch. `originalLanguage`, `composer`, `author`,
  and `ccli` are optional; a blank cell is stored as `null`, not an empty
  string.
- **Quoting**: wrap a field in double quotes if it contains a comma, a
  newline, or a double quote; escape a literal double quote inside a
  quoted field by doubling it (`""`). Both `\n` and `\r\n` line endings are
  accepted.
- **Re-importing is idempotent by `entryCode`**: a row whose `entryCode`
  already exists in this catalog updates that entry in place (all other
  columns overwritten from the new row, `undefined`/omitted-in-this-row
  values become `null`) rather than creating a duplicate; a new
  `entryCode` creates a new entry.

Example:
```csv
entryCode,title,originalLanguage,composer,author,ccli
0001,"Amazing Grace",en,,John Newton,
0002,"How Great Thou Art, arr.",sv,Stuart K. Hine,Stuart K. Hine,14181
```

### Import flow: catalog → working songbook (Implemented)

A user picks a catalog (e.g. "JEM") and imports it via
`POST /songbooks/import-from-catalog` (`{ catalogId, teamId?, global? }`):

1. A real `Songbook` is created (always `kind: NUMBERED`, since a catalog's
   entries carry a real per-book number), owned by the importing user's
   choice — USER or TEAM, or GLOBAL if they're a global admin (same
   `resolveOwnership()` rule `SongbooksService.create()` already used, now
   shared by both). **Never automatically GLOBAL.** This is the legal
   linchpin: the catalog is free to be GLOBAL (it's just facts), but the
   *content* someone subsequently writes into their copy of song #245 is
   their own transcription, under their own responsibility, and stays within
   whatever ownership scope they already control — never auto-published
   platform-wide. This is the same posture the platform already takes toward
   user-generated content everywhere else. `Songbook.sourceCatalogId` links
   the new songbook back to its catalog (`onDelete: SetNull` — deleting the
   catalog later leaves already-imported songbooks' real content untouched,
   they just stop offering more entries to start).
2. **Import is lazy.** Importing a 1,238-song catalog does not create 1,238
   `SongVersion` rows up front — most would sit blank and untouched. Instead,
   `SongbooksService.findOne()` computes a `pendingEntries` list (catalog
   entries with no matching `SongbookEntry` yet, by `entryCode`) whenever
   `sourceCatalogId` is set, and the real `SongVersion` (plus its
   `SongbookEntry`) is only materialized when the user clicks "Start" on one,
   via `POST /songbooks/:songbookId/catalog-entries/:catalogEntryId/materialize`.
   That route mints a blank `SongVersion` under the songbook's own ownership
   (`SongVersionsService.createOwned()` — the same blank-document-skeleton
   logic `create()` uses, but able to mint GLOBAL-owned versions directly,
   which the public create endpoint doesn't allow a caller to pick) and links
   it in with the catalog entry's number. A bulk content upload (§7) will be
   the second materialization path once it exists.
3. **Forward compatibility for licensed content**: if SongVerse ever secures
   distribution rights for a specific catalog (the `licensed` case), the same
   import mechanism can populate real, complete `SongVersion`s instead of
   blank stubs — this is a data flag to add later, not a different pipeline.

## 7. Bulk content upload (ChordPro + PDF), with matching

**Status: Implemented.** Once a user has a real songbook (imported or
hand-built), they can get their own transcriptions and scans in efficiently
rather than one song at a time: pick a batch of ChordPro or PDF files,
review the matches, confirm, and the actual writes happen in the
background.

- **Matching is number-first, not fuzzy-first.** `matchFilenamesToEntryCodes()`
  (`packages/core/src/bulk-upload-matching/index.ts`) extracts the numeric
  token from each filename ("0245.cho", "JEM_0245.pdf" → "245") and matches
  it against each real entry code, tolerating zero-padding differences
  ("3.cho" matches entry code "0003"). Title-similarity matching is not
  reliable enough to run unattended at this volume (e.g. "Amazing Grace" vs.
  "Amazing Grace (Reprise)") and isn't attempted at all - an unmatched file
  is reported, never guessed at.
- **A review step is mandatory, not optional polish.** `POST /songbooks/
  :songbookId/bulk-upload/preview` takes just filenames (no upload yet) and
  returns filename → matched entry code → status (`MATCHED` / `UNMATCHED` /
  `DUPLICATE`, the last when more than one file claims the same code) - the
  web UI renders this as a table before any file is actually sent, and the
  "Confirm upload" step only ever sends the `MATCHED` files.
- **ChordPro and PDF are handled differently**, because they aren't the same
  kind of artifact:
  - ChordPro text is the actual song content. `BulkUploadProcessor` runs
    each matched file's content through `SongVersionsService.importText()`
    - the same parse-and-cache path the single-song import endpoint uses,
      not a separate pipeline.
  - The **original uploaded ChordPro file is also kept**, as an `Attachment`
    (type `CHORDPRO`), alongside the parsed/editable version. This is
    distinct from `SongVersion.chordproCache` (a regenerated *export* of the
    current, possibly since-edited document) - the web UI's Attachments card
    and Content card are separate for exactly this reason.
  - PDFs are opaque reference files (scanned sheet music) - stored purely as
    an `Attachment` (type `PDF`) via the object storage from §8, no content
    parsing attempted.
- **Bulk upload is also the second materialization path for lazy import**
  (§6): `SongbooksService.ensureEntryForCode()` - the same lazy-
  materialization logic the interactive "Start" button uses - resolves each
  matched code to a SongVersion, materializing a pending catalog entry on
  demand. Uploading content for an entry nobody has opened yet is itself the
  "start."
- **Runs as a background job via BullMQ** (`apps/api/src/bulk-upload/`),
  exactly as planned: `POST /songbooks/:songbookId/bulk-upload` stores each
  matched file's bytes synchronously (fast - just a hash and a write, via
  the object storage from §8) and enqueues one small job per file -
  `{songbookId, entryCode, type, filename, mimeType, storageKey, sizeBytes}`,
  deliberately not the file's bytes, so the queue payload stays small
  regardless of file count. `BulkUploadProcessor` (`@Processor("bulk-
  upload")`) then does the actual materialize/parse/attach work per job,
  decoupling upload latency from the count of files being processed.
  Verified end-to-end: uploading a batch against a hand-built NUMBERED
  songbook's existing entries gets the right content into the right
  SongVersion, with the original file retained as an Attachment, entirely
  through the queue rather than inline in the HTTP request.

## 8. Object storage (R2), with content-addressed dedup

**Status: Implemented.** This was the first feature to actually need the
`R2_*` env vars declared in `.env.example` but never implemented. Design:

- Store objects keyed by **SHA-256** content hash, not a random per-upload
  ID and not CRC32. CRC32 is a checksum meant to catch accidental
  corruption, not to safely assert "these two files are identical" — at any
  nontrivial file count, collisions become a real risk, and a false match
  here means silently serving the wrong sheet music to someone. SHA-256 is
  the standard choice for content-addressed storage (Git, container
  registries) for exactly this reason. `StorageService.put()`
  (`apps/api/src/storage/storage.service.ts`) hashes the uploaded buffer and
  hands the hash to the underlying driver as the object key; `Attachment.
  storageKey` stores that hash (despite the column's old "S3 object key"
  name/comment from before this work — it's the same string, just now
  content-derived instead of random).
- Keying by hash gives deduplication for free: re-uploading byte-identical
  content (the same scanned PDF used across multiple teams' songbooks, say)
  resolves to the same storage object; multiple `Attachment` rows across
  different `SongVersion`s can point at the same underlying object. Verified
  end-to-end: uploading the same bytes twice under different filenames
  creates two `Attachment` rows but exactly one object on disk/in the
  bucket.
- **Deletion must never remove an object still in use elsewhere.** When an
  `Attachment` row is deleted (`AttachmentsService.remove()`), check whether
  any other `Attachment` rows still reference that same content hash — only
  issue the actual object-storage delete once the count reaches zero. This
  is checked on demand (`COUNT(*) WHERE storageKey = ?`) at delete time
  rather than via a separately-maintained reference counter, which could
  drift out of sync. Verified end-to-end: deleting one of two attachments
  sharing a hash leaves the object in place; deleting the last one removes
  it.
- **Two drivers, chosen automatically** (`StorageService`'s constructor):
  `S3StorageDriver` (R2 is S3-compatible, so the plain AWS SDK works against
  it given the account's R2 endpoint) when all `R2_*` env vars are set, else
  `LocalDiskStorageDriver` (writes under `apps/api/.data/attachments/`,
  gitignored) so attachments work in dev/test without cloud credentials —
  the same code path either way, just a different `ObjectStorageDriver`
  underneath.
- Exposed via `apps/api/src/attachments/` (`AttachmentsController`/
  `AttachmentsService`): `GET`/`POST /song-versions/:id/attachments`,
  `GET .../:attachmentId/download`, `DELETE .../:attachmentId`. Upload is
  guarded by `SongVersionOwnerGuard`; read/download reuse
  `SongVersionsService.assertVisibleById()` (extracted from `findOne()`'s
  visibility check, see §5) so an attachment can never be listed or
  downloaded by someone who couldn't see the song version it belongs to
  in the first place — the same private-by-default posture as everything
  else nested under a song version.
- Web: an "Attachments" card on the song detail page (type picker + file
  input, list with Download/Remove) — the same UI slot the bulk-upload
  work (§7) will build on.

## 9. Open questions

- ✅ Resolved: `licensed` was added to `SongbookCatalog` from the start (§6).
- ✅ Resolved: `SongVersion.findOne`'s missing visibility check was fixed
  alongside the reverse-lookup work (§5), sharing one helper rather than
  writing the same check twice.
- Bulk upload UI ships with a plain multi-file `<input type="file" multiple>`
  (works identically in every browser, and the user can still select an
  entire folder's contents by selecting all files inside it). Folder
  selection via `<input type="file" webkitdirectory>` would save that one
  extra step but only works reliably in Chromium - left as a future nicety
  rather than a launch requirement.

## 10. Suggested build order

1. ✅ `SongbookCatalog`/`SongbookCatalogEntry` CRUD + CSV import for initial
   seeding (§6). Nothing else here has anything to import from until this
   exists.
2. ✅ `Songbook.kind` + optional/unique `entryCode` + ranges (§3, §4) —
   smaller, self-contained schema change to the existing working model.
3. ✅ Reverse lookup on the song detail page (§5) — small, and exercised the
   visibility-filtering pattern before it's needed again for storage.
4. ✅ Lazy import-from-catalog (§6) — depends on #1.
5. ✅ Object storage + `Attachment` upload (§8) — foundational for #6.
6. ✅ Bulk content upload with matching and review (§7) — depends on #4 and #5.

All six items in the build order are now shipped.
