---
title: For admins
description: Reviewing songs for the global catalogue, and running a SongVerse server.
---

## Reviewers

A reviewer (or a global admin) checks songs submitted to the global catalogue. The **Review** page lists what's waiting. For each song you can:

- **Approve and publish** it, optionally with a trust label shown on the global song ("Official publisher text");
- **Merge into** a similar song already in the catalogue;
- **Ask for changes**, or **Reject** it, with a note for the submitter.

You can't review your own submissions. Global admins can also **Publish now** their own songs without a review.

## Global admins

Global admins manage the whole server from **Admin** in the sidebar.

### Users

Everyone with an account, with their status, songs and storage. For each user you can:

- **Change storage limit** - leave it blank to use the default;
- **Make reviewer** or remove the role;
- **Ban** them (they're signed out and can't sign in until unbanned; their content stays);
- **Delete user**, choosing what happens to what they personally own: delete it now, or keep it for a **transfer link**. Whoever opens that link while signed in, before it expires, becomes its owner.

### Auth

How SongVerse sends email (verification, password reset) through Resend, and whether **Google sign-in** is offered. Settings saved here take effect immediately; **Revert to environment variables** goes back to the server's configuration.

### Storage

Where uploaded files are kept (object storage such as Cloudflare R2, or local disk for development), how much is used, and the **default storage limit** per user. Global admins have no limit.

### Catalogs

Manages the published songbook catalogs (see [Songbooks](/songbooks/#from-a-published-songbooks-catalog)): add one, edit its entries in a table, import or export them as CSV or JSON.

### Server maintenance

The **Metadata** page has two maintenance tasks: **Check status** compares the database migrations on the server with what's applied, and **Run seed script** re-applies the built-in data (tag categories, tags, tuning presets). It's safe to re-run.
