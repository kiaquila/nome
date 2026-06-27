# Tasks: Repository Product Reset

- [x] T001 Inspect inherited repository structure and identify useful workflow
  pieces versus blueprint-only content.
- [x] T002 Remove blueprint generator directories, historical specs, examples,
  and bootstrap-only scripts.
- [x] T003 Rewrite root README and agent instructions for the Telegram assistant
  product.
- [x] T004 Add product memory under `docs_project/`.
- [x] T005 Add `.specify/memory/constitution.md` and `.env.example`.
- [x] T006 Reconfigure `.unicorn-hub/config.json` for product-mode checks.
- [x] T007 Update remaining scripts and PR template to remove blueprint-specific
  language.
- [x] T008 Refresh the lockfile and run local preflight.
- [x] T009 Push the branch and open a draft PR.

## Process Notes

- Kept `.unicorn-hub/config.json` as a compatibility path for the current guard
  scripts; this is workflow config, not product branding.
- Added a one-time transition fallback in PR Guard for PR #1 because the trusted
  default-branch context checker cannot handle deleted historical spec folders.
- Extended AI Review's wait window after the first ready-for-review run failed
  before external Codex review evidence appeared.
- Fixed staged-index existence checks in `check-context-budget.mjs` after Codex
  pointed out that staged spec edits could skip local substance validation.
- Included staged files in `check-feature-memory.mjs --worktree` so local
  preflight sees staged-only product changes.
- Deferred choosing the bot runtime and Telegram framework to the first product
  implementation spec.
