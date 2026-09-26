---
title: For admins
description: Reviewing songs for the global catalogue, and running a Songverse server.
---

## Reviewers

A reviewer (or a global admin) checks songs submitted to the global catalogue. The **Review** page lists what's waiting. For each song you can:

- **Approve and publish** it, optionally with a trust label shown on the global song ("Official publisher text"). The song itself moves to the catalogue, credited to whoever it came from; their files stay theirs;
- **Merge into** a similar song already in the catalogue: theirs is folded into it - their versions, files and sets move over, their way of singing it becomes their version of it, and their changed details come to you as a suggestion;
- **Ask for changes**, or **Reject** it, with a note for the submitter.

You can't review your own submissions. Global admins can also **Publish now** their own songs without a review.

The **Review** page also lists **Suggested changes** to catalogue songs (see [Suggesting a change](/library/#suggesting-a-change)). Each shows what it changes, from the song as it was when it was suggested; **Accept** saves it to the song in its author's name, **Decline** needs a note. If the song was changed since in the same place, it says where, and it can only be declined.

![A suggested change, for the reviewer](../../assets/screenshots/en/suggestion-review.jpg)

## Global admins

Global admins manage the whole server from **Admin** in the sidebar.

### Users

Everyone with an account, with their status, songs and storage. For each user you can:

- **Change storage limit** - leave it blank to use the default;
- **Make reviewer** or remove the role;
- **Ban** them (they're signed out and can't sign in until unbanned; their content stays);
- **Delete user**, choosing what happens to what they personally own: delete it now, or keep it for a **transfer link**. Whoever opens that link while signed in, before it expires, becomes its owner.

### Auth

How Songverse sends email (verification, password reset) through Resend, and whether **Google sign-in** is offered. Settings saved here take effect immediately; **Revert to environment variables** goes back to the server's configuration.

### Storage

Where uploaded files are kept (object storage such as Cloudflare R2, or local disk for development), how much is used, and the **default storage limit** per user. Global admins have no limit.

### Catalogs

Manages the published songbook catalogs (see [Songbooks](/songbooks/#from-a-published-songbooks-catalog)): add one, edit its entries in a table, import or export them as CSV or JSON.

### Server maintenance

The **Metadata** page has two maintenance tasks: **Check status** compares the database migrations on the server with what's applied, and **Run seed script** re-applies the built-in data (tag categories, tags, tuning presets). It's safe to re-run.

**Metadata providers** chooses where a song's **Auto detect** looks it up (see [The library](/library/)): MusicBrainz, Apple Music and Deezer, none of which needs a key. Tick the ones to use, and put them in order with the arrows: matches closest to the title and artist still come first, then the song's first release, and this order breaks what's left. **Save configuration** keeps it; **Revert to environment variables** goes back to the `METADATA_PROVIDERS` variable (the ones to use, in order, like `musicbrainz,deezer`), or to all three in this order without it.

**Apple Music API (MusicKit key)** is optional. Without a key, Apple Music is searched through iTunes Search, which needs none. With one, it's searched through the Apple Music API: the same songs, plus their ISRC and who wrote them. Create a MusicKit key in your Apple Developer account (Certificates, Identifiers & Profiles > Keys), then enter its **Team ID**, **Key ID** and **Private key (.p8)** - the whole file, BEGIN and END lines included. The private key is kept encrypted and never shown again: leave it blank to keep the current one. Until you have a key, **Developer token URL (without a key)** can take an address that answers with a developer token (`{"token": "eyJ…"}`, or `APPLE_MUSIC_TOKEN_URL`); each token is kept until it expires. Its tokens are signed by whoever runs that address, not your Apple account, so they can stop working at any time - a key, once saved, is used instead. **Test connection** tries a search with the key or the token. **Revert to environment variables** clears both and goes back to `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID` and `APPLE_MUSIC_PRIVATE_KEY` (or `APPLE_MUSIC_TOKEN_URL`), or to iTunes Search without them.

**Song artwork** turns artwork from Apple Music on or off (**Find artwork for songs**) and sets the **Apple Music storefront (country)** searched - two letters, like us or fr. **Save configuration** keeps them; **Revert to defaults** goes back to on, in the us storefront. **Find artwork for songs without one** looks up to 50 songs at a time, newest first; a song nothing matched isn't tried again. See [Artwork](/library/#artwork).
