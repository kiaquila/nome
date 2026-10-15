# AI PR Workflow

Nome uses a small inherited PR guard so product changes stay reviewable.

## Branches

- Work on one branch per feature or cleanup.
- Keep `main` releasable.
- Open ready-for-review PRs by default; use drafts for explicitly incomplete work.

## Feature Memory

Product-path changes must include a complete `specs/<feature-id>/` folder with:

- `spec.md` for goal, scope, acceptance criteria, and negative scenarios.
- `plan.md` for approach, verification, and risks.
- `tasks.md` for implementation checklist and process notes.

## Checks

The configured required checks live in `.unicorn-hub/config.json`. Run
`uv run python scripts/preflight.py` locally before pushing when changing code, docs, workflow
config, or feature memory.

## Native Codex evidence

Request review from a trusted human account with `@codex review <full-head-sha>`.
The command workflow records the current-head request. A native no-findings
receipt must include the reviewed commit; a mutable structured summary must
carry a completed typed verdict for the full head SHA. The marker, a reaction
or a Completed heading alone is insufficient. New requests do not resolve
findings, and every unresolved review thread blocks the Codex gate.

The rerun workflow accepts created and edited native evidence. It waits for an
active gate to finish and requeues the latest exact-head run when the evidence
is newer than that attempt. It also reevaluates a successful run after a changed
verdict. New pushes invalidate old evaluations. Both workflows continue running
trusted default-branch scripts; see specs/009-codex-native-review-receipts/plan.md
for the initial rollout constraint.
