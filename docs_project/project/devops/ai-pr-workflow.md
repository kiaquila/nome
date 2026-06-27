# AI PR Workflow

Nome uses a small inherited PR guard so product changes stay reviewable.

## Branches

- Work on one branch per feature or cleanup.
- Keep `main` releasable.
- Open draft PRs while checks or review evidence are still pending.

## Feature Memory

Product-path changes must include a complete `specs/<feature-id>/` folder with:

- `spec.md` for goal, scope, acceptance criteria, and negative scenarios.
- `plan.md` for approach, verification, and risks.
- `tasks.md` for implementation checklist and process notes.

## Checks

The configured required checks live in `.unicorn-hub/config.json`. Run
`pnpm run preflight` locally before pushing when changing code, docs, workflow
config, or feature memory.
