# Plan

## Delivery Path

GitHub Actions checks out the selected revision and creates a tar archive with
`git archive`. It assumes a repository-specific AWS IAM role through GitHub's
OIDC provider, uploads the archive to a private S3 bucket, and creates a
short-lived presigned download URL.

The workflow sends a small bootstrap script to the existing EC2 instance with
SSM Run Command. The bootstrap downloads and extracts the archive, then runs the
repository-owned deployment script as the `ubuntu` user.

External actions are pinned to full release commit SHAs so mutable tags cannot
change code that runs with the production workflow's OIDC permission.

## Host Deployment

`scripts/deploy_release.sh` serializes deployments with `flock`, syncs tracked
release files into the stable target directory, and excludes host-owned state.
Before running the destructive sync, it rejects targets that are not dedicated
Nome directories and target directory paths that are symlinks.
A pinned `uv` bootstrap environment in `.deploy/` synchronizes the production
environment exactly from the committed lockfile. The root `nome` package is
force-reinstalled so a code-only release cannot reuse stale site-packages when
the project version is unchanged. The script then compiles the Python package
before touching the running service.

The script renders `deploy/nome.service` with the configured absolute target
directory, installs it under systemd, restarts the service, and waits for both
the active state and the loopback health endpoint. Release metadata is written
only after those checks pass.

## Configuration

GitHub Actions repository variables provide these non-secret coordinates:

- `AWS_REGION`
- `AWS_DEPLOY_ROLE_ARN`
- `DEPLOY_S3_BUCKET`
- `DEPLOY_INSTANCE_ID`
- `DEPLOY_TARGET_DIR`

The host's existing `.env` remains the only runtime secret source. The workflow
does not read, upload, replace, or echo it.

## IAM

Use a dedicated `github-actions-nome-deploy` role. Its trust policy accepts
only the GitHub OIDC subject for the `kiaquila/nome` repository's `main` branch.
Its permissions are limited to the Nome deployment bucket and SSM commands plus
invocation status reads for the existing managed instance.

## Verification

- Parse the shell script with `bash -n`.
- Run a local no-systemd deployment smoke test against a temporary directory.
- Run `uv run python scripts/preflight.py`.
- Verify the pull request checks before merge.
- After merge, confirm the production workflow, release metadata, systemd
  status, and loopback health response.
