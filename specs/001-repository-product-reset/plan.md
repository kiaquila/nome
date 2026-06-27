# Plan: Repository Product Reset

## Approach

Keep the useful workflow core from the inherited repository and remove the parts
that only made sense for a portable blueprint source. The resulting repository
should be small enough for agents to understand quickly, but still enforce
feature memory and baseline checks before product code starts.

## Files To Keep

- Root launch context: `README.md`, `AGENTS.md`, `CLAUDE.md`.
- Workflow config: `.unicorn-hub/config.json`, `.github/workflows/`, and
  `.github/pull_request_template.md`.
- Guard scripts: feature-memory, context-budget, repo-baseline, AI review,
  worktree, and PR publishing helpers.
- Product memory: `docs_project/`, `.specify/memory/constitution.md`, and
  `specs/`.

## Files To Remove

- Bootstrap generator assets: `templates/`, `profiles/`, and bootstrap-only
  scripts.
- Historical blueprint docs and specs.
- Blueprint-specific tests and example target repositories.

## Verification

- Run `pnpm install --lockfile-only` after updating `package.json`.
- Run `pnpm run preflight`.
- Run `git status -sb` and inspect the diff before staging.

## Risks

- The inherited guard scripts still use `.unicorn-hub/config.json` as their config
  path. Keep that path in this PR so existing default-branch guard scripts can
  validate the cleanup.
- The default-branch context checker cannot validate deleted historical spec
  folders. Add a one-time PR Guard fallback restricted to PR #1 and the initial
  base SHA, then let future PRs use trusted default-branch validation only.
- Codex review can take longer than the original 30-second gate window. Extend
  the AI Review wait window so a fresh trusted review request has time to
  produce evidence before the check fails.
- `check-context-budget.mjs` must handle staged index contexts explicitly so
  local preflight validates staged feature memory before CI sees the commit.
- `check-feature-memory.mjs` should include staged files in `--worktree` mode so
  staged-only product changes do not skip the local feature-memory gate.
- Removing all tests is acceptable for this cleanup because no product runtime
  exists yet; the next implementation PR should add runtime-specific tests.
