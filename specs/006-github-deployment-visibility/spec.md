# Feature: GitHub Deployment Visibility For Production Merges

## Summary

Merges to `main` already deploy Nome to the production `bots` host over SSH, but
the runs left no trace in GitHub's **Deployments** view: the repository had no
`production` environment and no Deployment records. This feature makes the
deploy workflow record a GitHub Deployment for the `production` environment on
every run, transitioning it through `in_progress` and then a terminal
`success` or `failure` status.

The result is an auditable production deployment history in the repository
Deployments section and Environments sidebar, without changing how the release
is built or applied on the host.

## Goal

Give every `main` merge a first-class GitHub Deployment record tied to the
`production` environment so the deploy status is visible from the repository UI
and the REST/Deployments API.

## Scope

- Create a GitHub Deployment for the deployed revision at the start of the job.
- Mark the deployment `in_progress` before the host is touched.
- Finalize the deployment as `success` or `failure` from the job status.
- Auto-create and target the `production` environment so records surface in the
  Deployments section.
- Grant the workflow the minimal `deployments: write` permission.
- Keep the deploy transport (SSH), release build (`git archive`), and host
  script (`scripts/deploy_release.sh`) unchanged.
- Document the new visibility behavior in the deployment docs.

## Non-Goals

- Adding native GitHub Environment protection rules or required reviewers.
- Publishing a public `environment_url` (the service listens on host-local
  `127.0.0.1:8000`).
- Reconciling deployments stranded by a hard runner termination.
- Changing deployment coordinates, secrets, or the host-side release lifecycle.

## Acceptance Criteria

- After a merge to `main`, the repository Deployments section shows a
  `production` deployment for the merged revision.
- A successful run leaves the deployment in the `success` state; a failed run
  leaves it in `failure`.
- A configuration-validation failure (missing SSH secrets) creates no dangling
  deployment record.
- `actionlint` and `uv run python scripts/preflight.py` pass.
