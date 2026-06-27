# Spec: Repository Product Reset

## Goal

Turn the copied Unicorn Hub blueprint into the starting repository for `nome`, a
private Telegram personal-assistant bot, while preserving the useful PR-first
guardrails needed for later development.

## Scope

In scope:

- Replace blueprint-facing README and agent instructions with `nome` product
  context.
- Remove generator assets, old blueprint specs, bootstrap tests, and example
  target repositories that do not belong to the bot product.
- Add durable product memory under `docs_project/`.
- Configure repository checks for product mode rather than blueprint-source mode.
- Keep inherited PR guard scripts and workflows that remain useful for feature
  memory, review routing, and baseline validation.

Out of scope:

- Implementing Telegram bot runtime code.
- Choosing a final runtime, hosting provider, database, or Telegram framework.
- Configuring real secrets, user ids, or deployment identifiers.

## Acceptance Criteria

- AC-001: Root `README.md`, `AGENTS.md`, and `CLAUDE.md` describe `nome` as a
  private Telegram personal-assistant bot.
- AC-002: Blueprint-only directories such as `templates/`, `profiles/`,
  `examples/`, old `docs/`, old `tests/`, and historical blueprint specs are
  removed.
- AC-003: `.unicorn-hub/config.json` uses product paths, `docs_project`, `specs`,
  and product-mode checks instead of blueprint-source requirements.
- AC-004: `docs_project/` records the product brief, architecture boundaries,
  PR workflow, and review contract for later bot development.
- AC-005: Local preflight passes after the cleanup.

## Negative Scenarios

- The PR must not add real Telegram tokens, chat ids, user ids, API keys, exported
  messages, or personal data.
- The PR must not implement product code before the runtime and library choices
  are specified.
- The cleanup must not remove the PR guard scripts required by the current
  workflows.
