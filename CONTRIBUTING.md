# Contributing to Songverse

Thank you for helping. Songverse is free software under the
[AGPL-3.0](LICENSE); by contributing you agree your work is released under
the same licence.

## Start with an issue

Open issues are the plan. Check them before starting, and describe a fix or
an enhancement in one (new or existing) before you write it. Reference it in
your commits, with `Closes #n` in the one that finishes it.

## Checks

```sh
pnpm lint
pnpm type-check
pnpm test
pnpm e2e        # needs the app running; see e2e/README.md
```

Add or extend an end-to-end suite in `e2e/` with each feature or fix. A
change that alters what people see updates the user documentation in
`apps/docs`, in English and French (see `apps/docs/README.md`). The
conventions the codebase follows are written in [CLAUDE.md](CLAUDE.md),
which is as useful to a person as to an AI tool.

## AI-assisted work

Songverse itself is built with a lot of AI assistance, and contributions made
with AI tools are welcome on the same terms as any other. What we ask:

- **You are the author.** Read, understand and be able to explain every line
  you submit. "The AI wrote it" is not a reason a change is right, and we
  will ask you to justify and maintain it like any code.
- **Test it.** Run the checks above and add tests. Don't submit code you
  haven't run.
- **Mind the licence.** Don't paste large blocks you can't trace, and don't
  add a dependency without checking its licence is compatible with the AGPL.
- **Keep it small and focused.** One change per pull request, in the style of
  the surrounding code.
- **Say so when it matters.** If a change is mostly generated, mention it in
  the pull request. This is for transparency, not a penalty.
- **No secrets or private data** in prompts, logs or commits, and never real
  user content.

Be especially careful with sign-in, file serving, signed addresses and
anything that handles uploads: these get a closer review whoever wrote them.

## Reporting a security problem

Please don't open a public issue for a vulnerability. Contact the
maintainer privately (see the repository's security policy or profile) and
give us time to fix it before it is made public.
