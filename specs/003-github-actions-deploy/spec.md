# Feature: GitHub Actions Production Deployment

## Summary

Nome can be deployed to its existing AWS host from GitHub Actions. A production
deployment packages an immutable Git revision, transfers it through S3, invokes
the host through AWS Systems Manager, and restarts the existing systemd service.

## Goal

Make delivery to the single production host repeatable and auditable without
putting SSH keys, Telegram credentials, or other long-lived AWS credentials in
GitHub.

## Scope

- Deploy every commit merged to `main` and support a manual deployment trigger.
- Authenticate GitHub Actions to AWS with OIDC and a production IAM role.
- Transfer a release archive through a private S3 deployment bucket.
- Execute the host deployment through AWS Systems Manager Run Command.
- Preserve the host-owned `.env`, virtual environment, SQLite data, and deploy
  metadata between releases.
- Install production dependencies, compile the Python package, update the
  systemd unit, restart Nome, and verify the local health endpoint.
- Record the deployed Git SHA and timestamp on the host.

## Non-Goals

- Changing Telegram update delivery from webhook to long polling.
- Publishing Nome's HTTP endpoint to the internet.
- Moving runtime secrets from the host into GitHub.
- Adding multi-host deployment, containers, or automatic rollback.

## Acceptance Criteria

- AC-001: A push to `main` starts the production deployment workflow, and an
  operator can also dispatch it manually.
- AC-002: The workflow requests only `contents: read` and `id-token: write` and
  assumes an AWS role without stored AWS access keys.
- AC-003: The exact checked-out Git revision is archived, uploaded to S3, and
  sent to the configured EC2 instance with SSM Run Command.
- AC-004: Deploying with `rsync --delete` does not replace or delete `.env`,
  `.venv`, `data/`, or `.deploy/` on the host.
- AC-005: The deploy script installs the current Python project, verifies that
  it compiles, installs the managed systemd unit, and restarts `nome.service`.
- AC-006: The workflow fails unless `nome.service` becomes active and
  `http://127.0.0.1:8000/healthz` returns a successful response.
- AC-007: A successful deploy writes `.deploy/current_release.json` with the
  release SHA, UTC deployment time, and target directory.
- AC-008: No Telegram token, webhook secret, production identifier, `.env`
  contents, or database content is committed or printed by the deployment.
- AC-009: Local preflight passes before the deployment change is published.

## Operational Safety

- GitHub repository variables hold non-secret deployment coordinates only.
- The AWS role trusts only workflow runs whose OIDC subject is the repository's
  `main` branch.
- Runtime secrets remain in `/home/ubuntu/nome/.env` with restrictive
  permissions and are loaded by systemd.
- Deployments are serialized so two releases cannot update the host at once.
- The service listens on loopback only; public HTTPS remains out of scope while
  webhook delivery is being replaced in a follow-up change.
