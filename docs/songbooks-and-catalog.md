# Songbooks & Songbook Catalog

Status: **design in progress**. Sections are marked Implemented / Planned below.
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

## 5. Planned: reverse lookup (which songbooks is this song in?)

A song can belong to many songbooks. The song's own detail page should show
a "Songbooks" card listing each one it's a member of, with its number (and
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

**Status: Implemented** (catalog + entries CRUD, CSV import). The import
flow into a working songbook, in the second half of this section, is still
**Planned**.

A separate, purely informational layer — think Goodreads/Google Books for
hymnals. Two new models, unrelated to `Songbook`/`SongbookEntry`:

```
SongbookCatalog        — name, publisher, ISBN, description, cover image,
                          official URL, language, denomination, stated total
                          entry count, licensed flag
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
population is a CSV import (header row; entryCode, title, originalLanguage,
composer, author, ccli columns) a global admin runs per catalog, upserting
by entryCode so re-importing updates rather than duplicates and reporting
per-row errors without aborting the whole batch. Ongoing maintenance
(editing entries, adding more one at a time) is a normal CRUD UI on top, not
a one-time-only import. Reading the catalog is open to any authenticated
user (so they can browse what's available before importing); writing to it
is global-admin-only, via the existing `GlobalAdminGuard`.

### Import flow: catalog → working songbook (Planned)

A user picks a catalog (e.g. "JEM") and imports it:

1. A real `Songbook` is created, owned by the importing user's choice — USER
   or TEAM. **Never automatically GLOBAL.** This is the legal linchpin: the
   catalog is free to be GLOBAL (it's just facts), but the *content* someone
   subsequently writes into their copy of song #245 is their own transcription,
   under their own responsibility, and stays within whatever ownership scope
   they already control — never auto-published platform-wide. This is the
   same posture the platform already takes toward user-generated content
   everywhere else.
2. **Import is lazy.** Importing a 1,238-song catalog does not create 1,238
   `SongVersion` rows up front — most would sit blank and untouched. Instead,
   import reserves the number/title pairing, and the real `SongVersion` (plus
   its `SongbookEntry`) is only materialized the first time the user acts on
   that specific entry — either by opening it to start editing, or via a bulk
   content upload (§7) that supplies content for it directly.
3. **Forward compatibility for licensed content**: if SongVerse ever secures
   distribution rights for a specific catalog (the `licensed` case), the same
   import mechanism can populate real, complete `SongVersion`s instead of
   blank stubs — this is a data flag to add later, not a different pipeline.

## 7. Planned: bulk content upload (ChordPro + PDF), with matching

Once a user has a real songbook (imported or hand-built), they need to get
their own transcriptions and scans in efficiently rather than one song at a
time. Target: upload a folder of ~1,000+ ChordPro files and/or PDFs in one
go, matched automatically to the right entries.

- **Matching is number-first, not fuzzy-first.** Extract the numeric token
  from each filename ("0245.cho", "JEM_0245.pdf" → 245) and match against
  each entry's code. Title-similarity matching is not reliable enough to run
  unattended at this volume (e.g. "Amazing Grace" vs. "Amazing Grace
  (Reprise)") and is, at most, a secondary aid for files that don't match by
  number.
- **A review step is mandatory, not optional polish.** Before anything is
  written, show filename → matched entry → status (matched / unmatched /
  conflict), so mismatches are caught by a human before a bulk write, not
  after.
- **ChordPro and PDF are handled differently**, because they aren't the same
  kind of artifact:
  - ChordPro text is the actual song content. Each matched file is run
    through the existing single-song ChordPro import path
    (`POST /song-versions/:id/import`) rather than a new pipeline — bulk
    import is that same operation, run many times.
  - The **original uploaded ChordPro file is also kept**, as an `Attachment`
    (type `CHORDPRO`), alongside the parsed/editable version. This is
    distinct from `SongVersion.chordproCache` (a regenerated *export* of the
    current, possibly since-edited document) — the UI should label these
    differently ("original upload" vs. "current export") so they're never
    confused as the same artifact. Worth doing for the existing single-file
    import path too, not just bulk, since it's the same mechanism either way.
  - PDFs are opaque reference files (scanned sheet music) — these map
    directly onto the existing, currently-unimplemented `Attachment` model
    (type `PDF`), which needs real object storage behind it (§8).
- **Bulk upload is also the second materialization path for lazy import**
  (§6): uploading content for an entry nobody has opened yet is itself the
  "start" — no separate step needed to reconcile lazy stubs with bulk
  content.
- Given the file counts involved, this runs as a background job via BullMQ
  (already wired into the API in `apps/api/src/worker.ts`, currently unused)
  rather than a single long-lived synchronous request.

## 8. Planned: object storage (R2), with content-addressed dedup

This is the first feature that actually needs the `R2_*` env vars already
declared in `.env.example` but never implemented. Design:

- Store objects keyed by **SHA-256** content hash, not a random per-upload
  ID and not CRC32. CRC32 is a checksum meant to catch accidental
  corruption, not to safely assert "these two files are identical" — at any
  nontrivial file count, collisions become a real risk, and a false match
  here means silently serving the wrong sheet music to someone. SHA-256 is
  the standard choice for content-addressed storage (Git, container
  registries) for exactly this reason.
- Keying by hash gives deduplication for free: re-uploading byte-identical
  content (the same scanned PDF used across multiple teams' songbooks, say)
  resolves to the same storage object; multiple `Attachment` rows across
  different `SongVersion`s can point at the same underlying object.
- **Deletion must never remove an object still in use elsewhere.** When an
  `Attachment` row is deleted, check whether any other `Attachment` rows
  still reference that same content hash — only issue the actual
  object-storage delete once the count reaches zero. This is checked on
  demand (`COUNT(*) WHERE storageKey = ?`) at delete time rather than via a
  separately-maintained reference counter, which could drift out of sync.
  The metadata-layer delete-and-recount happens in one DB transaction; the
  actual storage delete, issued after, is safe even in a rare race because
  deleting an already-deleted object key is a no-op — the danger to guard
  against is only ever the one-directional case (deleting something still
  referenced), not the reverse.

## 9. Open questions

- Should catalogs support a `licensed` flag now (even before any catalog is
  actually licensed), so the import pipeline is ready for it later, or add
  it when the first real licensing deal exists?
- Bulk upload UI: folder selection (`<input type="file" webkitdirectory>`)
  works well in Chromium but needs a fallback/explanation for other
  browsers — worth deciding how much effort that gets.
- Should `SongVersion.findOne`'s missing visibility check (a pre-existing
  gap, unrelated to this feature) be fixed alongside this work, since the
  reverse-lookup feature (§5) is adding a second place that needs the same
  kind of check done correctly?

## 10. Suggested build order

1. ✅ `SongbookCatalog`/`SongbookCatalogEntry` CRUD + CSV import for initial
   seeding (§6). Nothing else here has anything to import from until this
   exists.
2. ✅ `Songbook.kind` + optional/unique `entryCode` + ranges (§3, §4) —
   smaller, self-contained schema change to the existing working model.
3. Reverse lookup on the song detail page (§5) — small, and exercises the
   visibility-filtering pattern before it's needed again for storage.
4. Lazy import-from-catalog (§6) — depends on #1.
5. Object storage + `Attachment` upload (§8) — foundational for #6.
6. Bulk content upload with matching and review (§7) — depends on #4 and #5.
