# AGENTS.md - Nome

Nome is a private Telegram personal-assistant bot. Build it as a
privacy-sensitive product, not as a generic workflow template.

## Read Order

1. Active `specs/<feature-id>/spec.md`
2. Active `specs/<feature-id>/plan.md`
3. Active `specs/<feature-id>/tasks.md`
4. `docs_project/project/product-brief.md`
5. `docs_project/project/architecture.md`
6. `.unicorn-hub/config.json` for paths, commands, and checks

## Rules

- Use one branch, one worktree, and one pull request per meaningful change.
- Product changes must include one complete spec folder with `spec.md`, `plan.md`,
  and `tasks.md`.
- Treat Telegram tokens, user ids, chat ids, message text, and assistant memory as
  private data.
- Never commit real secrets, production identifiers, exported chats, or personal
  paths.
- Keep Telegram handlers thin; put side effects behind injected ports/adapters.
- Prefer explicit allowlists and reversible actions over broad automation.
- Run `pnpm run preflight` before pushing unless the user explicitly scopes the
  work to analysis only.

## Completion

A change is complete when the spec acceptance criteria have evidence, local
preflight passes or the failure is explained, and the PR has no blocking review
findings.
