# CLAUDE.md - Nome

Claude Code may implement changes in this repository when asked by the owner.

## Operating Context

Nome is a private Telegram personal-assistant bot. Optimize for trustworthy
personal workflows, clear boundaries, and safe handling of private data.

## Development Rules

- Read the active feature memory before code changes.
- Keep product behavior in small Telegram handlers plus injected ports.
- Do not hard-code secrets, user ids, chat ids, API keys, or production URLs.
- Avoid broad automation that can send messages, schedule events, or mutate
  external services without explicit user intent.
- Update `docs_project/` when architecture or product decisions change.
- Run `uv run python scripts/preflight.py` before publishing a PR.

## Review Notes

Call out privacy risk, unsafe side effects, missing allowlist checks, weak
validation, or ambiguous assistant behavior before style issues.
