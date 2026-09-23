# SongVerse

A songbook and set-planning app for worship teams and musicians: keep your
chord charts in one library, organise them into songbooks, plan what you're
playing on Sunday, and share it with the people playing with you.

## Features

- **Song library** – personal, team and global songs. Paste a chart as
  ChordPro or "chords over lyrics" and it's parsed into a structured,
  rendered chart; export back to ChordPro. Key, tempo, contributors, tags,
  streaming links (Spotify, Apple Music, YouTube) and file attachments,
  with image thumbnails.
- **MusicBrainz matching** – link a song to its MusicBrainz recording and
  work to pull in artist and songwriter credits.
- **Songbooks** – simple or numbered collections, built by hand, imported
  from a published songbook catalogue, or filled by bulk-uploading files
  matched to entries.
- **Songbook catalogues** – the numbers, titles, credits, keys, tempos,
  scripture references and tags of published songbooks (facts only, no
  lyrics), kept in an editable table, imported and exported as CSV or JSON
  ([format](docs/songbook-catalog-format.md)). Songs created from a
  catalogue entry start with its details filled in.
- **Sets** – ordered song lists for a service or gig, dated or named, with
  drag-and-drop ordering, a version and key per song. Personal or owned by
  a team; share one with guest musicians by link, who can read every song
  in it and keep private notes. A personal set can move to a team, sharing
  its owner's songs read-only until they hand them over.
- **Teams** – invite links, member and admin roles, and each member's
  instruments and other roles (sound, media, tech) shown on the team.
- **Accounts** – email and password, passkeys and Google sign-in; email
  verification, password reset and email change; avatars; per-user storage
  limits.
- **Admin** – manage users (ban, delete with or without handing their
  content over), storage (Cloudflare R2 or local disk), sign-in providers
  and email, all editable in the app rather than only through environment
  variables.
- **English and French**, and usable on a phone.

## Tech stack

| Area | Built with |
| --- | --- |
| Monorepo | pnpm workspaces, Turborepo, TypeScript |
| Web app (`apps/web`) | TanStack Start and Router (React 19, SSR), Vite, Tailwind CSS 4, shadcn/ui, dnd-kit, react-i18next |
| API (`apps/api`) | NestJS, BetterAuth (sessions, passkeys, OAuth, JWTs for API calls), BullMQ workers on Redis, sharp for images, Resend for email |
| Data (`packages/db`) | PostgreSQL with Prisma; migrations run when the API starts |
| Shared (`packages/core`) | API client, zod schemas, ChordPro and chords-over-lyrics parsers, key transposition, translations, tested with Vitest |
| Storage | Cloudflare R2 (S3-compatible) or local disk, content-addressed |
| Deployment | Docker images for the API/worker and the web app, run on Dokploy |

## Getting started

Requires Node 20+, pnpm and Docker.

```sh
pnpm install
docker compose up -d postgres redis
cp apps/api/.env.example apps/api/.env       # then fill in the values
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
pnpm db:migrate
pnpm dev                                     # web on :3000, API on :3001
```

`pnpm lint`, `pnpm type-check` and `pnpm test` run the checks across the
workspace. See [Deploy.md](Deploy.md) for production setup.
