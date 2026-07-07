# Plan

## Deployment Record Lifecycle

Extend `.github/workflows/deploy.yml` (single `deploy-production` job) with two
`actions/github-script` steps around the existing SSH transport, and grant the
job `deployments: write` in addition to `contents: read`.

1. **Start GitHub deployment** — runs after configuration validation and
   release-metadata resolution, before the release archive is built. It calls
   `repos.createDeployment` for the resolved release SHA with
   `environment: "production"`, `production_environment: true`,
   `required_contexts: []` (so pending checks never block the record), and
   `auto_merge: false` (so no base-branch merge is attempted). It exports the
   deployment id and posts an `in_progress` status with the run URL as
   `log_url`.
2. **Finalize GitHub deployment** — runs last with
   `if: always() && steps.deployment.outputs.id`, so it is skipped when no
   deployment was created (for example when secret validation fails first). It
   maps `job.status` to a terminal `success` or `failure` deployment status.

The deployment id is created before the `in_progress` status write, so a failed
status write still leaves a record the finalize step can terminalize.

## Ordering And Safety

- The Start step is placed after `Validate deployment configuration`, so a
  missing-secret failure produces no dangling `in_progress` record.
- Runtime values (`RELEASE_SHA`, deployment id, job status) are passed through
  the step `env:` block and read via `process.env`, never interpolated into the
  inline script body, to avoid Actions script injection.
- `permissions` stays minimal: `contents: read` plus `deployments: write`. This
  is the only job in the workflow, so the scope applies nowhere else.
- The `actions/github-script` action is pinned by commit SHA (v7.1.0).

## Known Limitation

A hard runner termination between the Start and Finalize steps can strand a
deployment in `in_progress`, because there is no reconciliation job. Ordinary
step failures, the job timeout, and superseded-run cancellations are all
terminalized correctly. Reconciliation is intentionally out of scope for a
single-host personal deployment.

## Verification

- `actionlint .github/workflows/deploy.yml`.
- `uv run python scripts/preflight.py`.
- Confirm no runtime Python behavior changes (docs and workflow only).
