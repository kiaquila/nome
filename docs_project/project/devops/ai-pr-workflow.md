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

The rerun workflow accepts created and edited native evidence. A completion event recovers
evidence arriving at the end of an active gate and requeues the latest exact-head
run when the evidence is newer than that attempt. It also reevaluates a successful run after a changed
verdict. New pushes invalidate old evaluations. Write-capable jobs execute trusted
default-branch scripts. Validation has only read permissions, never persists
checkout credentials and cannot post administrative requests or failure comments.
Comment-mode requests run separately and require the default workflow ref.

For an initial parser upgrade, a maintainer can promote an independently reviewed
immutable snapshot through the Actions variable
`AI_REVIEW_GATE_PIN=<default-full-sha>:<reviewed-gate-full-sha>`. Inspect that exact
snapshot, imports and configuration, run preflight, and verify genuine native
review directly before setting the pin. The default SHA must match the trusted
checkout; a changed base fails closed. Only read-only validation uses the pin.
Obtain final-head native review and run the actual PR workflow, verifying live
evidence and all unresolved threads. Keep CI fully green for 120 seconds before
normal merge, then remove the pin and verify default-branch validation. A manual
dispatch alone does not replace the real PR check. See
specs/009-codex-native-review-receipts/plan.md for the rollout evidence and policy.
