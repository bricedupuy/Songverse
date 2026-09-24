# Working offline

Status: **proposal**, nothing built yet. This is how SongVerse could keep
working without a network, in phases, and the decisions to make first.

## Why

Songs are used where the network is worst: a church hall, a basement
rehearsal room, a festival stage. Perform and practice modes are only
trustworthy if tonight's set opens with no Wi-Fi. Editing on a train is
nice to have; reading at the venue is essential.

## Three levels

| Level | What works offline | Conflicts | Size |
|---|---|---|---|
| 1. Read | Chosen sets and songs, their charts, PDFs and audio | None: read-only | Phase 1 |
| 2. Personal changes | Your notes, chart preferences, set order | Rare, one owner: last write wins per field | Phase 2 |
| 3. Shared editing | Editing songs other people also edit | Real: needs merging | Phase 3, decided together with real-time collaboration |

## Where we start from

What stops it today:

- **Pages are drawn on the web server.** TanStack Start draws each page on
  the server, and route loaders call the API. `_protected.tsx`'s
  `beforeLoad` calls `loadAppData()` (`apps/web/src/lib/app-data.ts`),
  which asks the web server for the session (`server-auth.ts` forwards the
  cookie to the API). With no network that fails, and the user is sent to
  sign in.
- **Nothing is stored in the browser** except the API token and a
  one-minute in-memory cache of the sidebar lists. Every page loads its
  data fresh.

What already helps:

- **The chart is drawn in the browser** from the document alone:
  `SongChart`, `layoutChordLine`, `transposeChord` (core). An offline chart
  only needs the song's JSON.
- **Stable IDs everywhere and a `revision` per song**
  (`docs/song-document-v2.md`). Sync and merge need both.
- **Core is shared.** Offline logic (the local store's shape, the sync
  protocol, merging) belongs there, so a mobile app reuses it.

## Phase 1: sets available offline, read-only

### The app itself (service worker)

- A web app manifest and a service worker make SongVerse installable (a
  PWA) and keep its code: the JS and CSS bundles, fonts, icons and an
  **app shell** - a page that boots the app in the browser without the
  server. TanStack Start can build that shell next to the server-drawn
  pages.
- **Online, nothing changes:** pages are still drawn on the server.
- **Offline, the service worker serves the shell for any page** and the
  app runs entirely in the browser.
- **Updates:** a new version installs in the background and applies on the
  next launch, never in the middle of a performance.

### The data (IndexedDB)

One IndexedDB database per signed-in user:

| Store | Holds | Key |
|---|---|---|
| `session` | The last known session (user, locale, roles) and when it was confirmed | singleton |
| `sets` | `SetlistDetail` as the API returns it | set ID |
| `songs` | The song as a set shows it (sections, flow, key, tempo, capo), plus the song's `revision` and `updatedAt` | song version ID |
| `files` | Attachment blobs (PDF, audio, images) | attachment ID |
| `meta` | Sync cursor, what's pinned, sizes | key |

- **What's downloaded:**
  - sets the user marks **"Available offline"**;
  - automatically, their next few sets by date (the number is a setting).

  Each set is downloaded with every song in it and, optionally, its files.
- **Storage:**
  - ask for persistent storage with `navigator.storage.persist()`,
    otherwise the browser may evict it;
  - show how much space is used, per set, with a way to remove it.

  Audio is the big cost, so it's a separate choice ("include audio").

### Loading pages

A small data layer sits between the route loaders and `apiClient`:

- **Online:** fetch from the API as today, and write through to IndexedDB
  for anything that's kept offline.
- **Offline (or when a request fails because there's no network):** read
  from IndexedDB. Anything not stored gets a clear "Not available offline"
  page, never a sign-in redirect.
- **Session:** `loadAppData()` falls back to the stored session when the
  network is down. The user stays signed in, read-only, and the app says
  so.
  - When the connection is back, the session is checked again first. If
    it's gone (signed out elsewhere, banned, deleted), the local data is
    wiped.
- **Offline banner:** it shows how fresh the data is ("Updated 2 hours
  ago"). Editing controls are disabled offline.

This could be TanStack Query with its persisted cache, or a hand-written
store. Choose when building it; TanStack Query is the less custom option.

### API support

- `GET /setlists/:id/offline` - the set, every song as the set shows it,
  and attachment metadata, in one response. It replaces a request per song.
- `GET /sync/changes?since=<cursor>` - what changed for this user since the
  cursor: updated sets and songs (IDs and revisions), **deletions** and
  **lost access** (a song unshared, a team left). The client refreshes
  what changed and removes the rest.
- Attachments are content-addressed already, so they can be fetched
  once and cached indefinitely (`Cache-Control: immutable` on the
  attachment's hash URL).

### Security

- **Local data is readable by anyone who has the device unlocked.** State
  that plainly in the "Available offline" help.
- **Losing access:** songs the user no longer has access to are removed
  at the next sync, so a lost device keeps its copies until then.
- **Signing out** deletes the user's IndexedDB database and cached files.
- **Scope:** only what the user could already see is ever downloaded; the
  endpoints re-check access like every other.

## Phase 2: personal changes offline

- Changes to things only the user owns are queued in an **outbox** in
  IndexedDB and sent in order when back online:
  - personal notes on a set's songs;
  - chart preferences (`chart-preferences/v1`: hidden chords, simplified
    chords);
  - their own set's order and keys.
- They're one owner, per field: **last write wins**, using the time of
  the change, so an edit made offline and synced later doesn't overwrite
  a newer one.
- **Sending:** each queued change carries an ID, so sending it twice is
  harmless.
- **Failures:** a change refused on reconnect (access lost, set deleted)
  is shown to the user, never dropped silently.

## Phase 3: editing shared songs offline

This is the same problem as **real-time collaboration**: several people
changing one song without talking to the server in between. Decide the
two together.

### Option A: merge on reconnect (fits what we have)

- The offline editor saves against the `revision` it started from.
- **Today:** a stale save is refused (409).
- **Instead, a three-way merge by ID:**
  - base = the revision the edit started from;
  - theirs = the stored song;
  - yours = the edit.
- Most edits merge cleanly: different lines, a chord moved in one place
  and a lyric fixed in another, a section added on each side. Only the
  same line or chord changed on both sides is a conflict, shown side by
  side for the user to pick.
- Stable section, line and chord IDs make this tractable; the merge
  lives in core.
- **Cost:** moderate. No live co-editing.

### Option B: a CRDT (Yjs)

- Each song is a Yjs document, kept locally with `y-indexeddb` and synced
  through a small sync server (or `y-websocket` / Hocuspocus). Tiptap's
  collaboration extension edits it directly.
- Offline edits merge automatically, and **live co-editing** (with other
  people's cursors) comes with it.
- **The stored SongDocument becomes a snapshot** written from the Yjs state.
  Arrangements and IDs keep working from that snapshot.
- **Cost:** larger - the Yjs model of a song, the sync server, snapshots,
  access control on the socket.

**Recommendation:** if live co-editing is wanted someday, go to Yjs
directly rather than building the merge first. Otherwise Option A is
enough.

## Testing

- Playwright can take the browser offline (`context.setOffline(true)`).
- An e2e suite would:
  1. mark a set available offline, go offline, reload, and check that the
     set, a chart and a PDF open;
  2. check that an unpinned song says "Not available offline";
  3. check that nothing redirects to sign-in;
  4. come back online and check that a song unshared in the meantime is
     removed.
- Phase 2 adds: change a note offline, reconnect, and see it saved; the
  same change from two devices keeps the newer one.

## The mobile app

A React Native / Expo app can reuse the same design with SQLite for
storage (instead of IndexedDB) and the file system for attachments:

- the same sync endpoints;
- the same outbox;
- the same merge or Yjs documents.

That's the reason to put the store's shape, sync and merge in
`@songverse/core`, not in `apps/web`.

## Decisions to make first

1. **Level:** is Phase 1 (read offline) enough to start with? It's what
   perform mode needs.
2. **What downloads automatically:** only pinned sets, or also the next few
   by date, or the whole library? Audio included or opt-in?
3. **Live co-editing someday?** That picks Option A or B for Phase 3.
4. **Mobile app timing:** if it's soon, design the sync protocol with it
   in mind from the start.

## Rough sizes

| Phase | Work |
|---|---|
| 1 | Service worker and app shell, IndexedDB store, loader fallback, offline session, "Available offline" UI, the two API endpoints, e2e suite - about 1 to 2 weeks |
| 2 | Outbox, last-write-wins for personal data, conflict notices - about 1 to 2 weeks |
| 3A | Three-way merge by ID in core, conflict UI - about 2 weeks |
| 3B | Yjs model, sync server, snapshots, collaboration UI - 3 weeks or more |
