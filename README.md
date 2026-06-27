# Nome

Nome is a private Telegram bot for a personal assistant workflow. The first
product direction is a single-owner assistant that can capture tasks, notes,
reminders, and later coordinate with external services through explicit,
auditable integrations.

This repository is no longer the Unicorn Hub blueprint source. It keeps a small
subset of the inherited PR-first workflow because that workflow is useful for
building a privacy-sensitive assistant, but product decisions now live in
`docs_project/` and feature memory lives in `specs/`.

## Current Shape

- `docs_project/` contains durable product and architecture context.
- `specs/` contains per-PR feature memory: `spec.md`, `plan.md`, and `tasks.md`.
- `scripts/` contains repository checks, PR guard helpers, and AI review routing.
- `.github/workflows/` runs baseline checks, PR guard, AI review, and dependency scans.
- `.unicorn-hub/config.json` is retained as the inherited workflow config path so
  current guard scripts can read it; it is configured for `nome`, not for a
  blueprint source repository.

## Development Workflow

1. Create one branch and one PR per meaningful change.
2. Add or update one complete `specs/<feature-id>/` folder before changing product
   paths.
3. Keep secrets out of git. Use `.env.example` for variable names only.
4. Run the local check before pushing:

```bash
pnpm run preflight
```

## Product Starting Point

The initial implementation should be a minimal Telegram assistant foundation:

- Telegram update handling with explicit allowlisted user ids.
- Handler-first command and conversation structure.
- Isolated ports for storage, LLM calls, calendars, mail, and reminders.
- Safe defaults for logging, secret handling, and personal data retention.

See `docs_project/project/product-brief.md` and
`docs_project/project/architecture.md` before adding product code.
