# Production Deployment

## Overview

Nome deploys to one production host over SSH from GitHub Actions. The workflow
checks out the selected revision, builds a `git archive` tarball, copies it to
the SSH target, and runs `scripts/deploy_release.sh` on the host. The current
production host is reached operationally as `ssh bots`.

The workflow is defined in `.github/workflows/deploy.yml`. It runs after a push
to `main` and can also be dispatched manually for a revision already contained
in `main` history.

GitHub logs keep deployment coordinates in masked repository secrets. The host's
runtime `.env`, SQLite data, virtual environment, Telethon sessions, and deploy
metadata stay on the server across releases.

## GitHub Secrets

Define these repository-level GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `DEPLOY_SSH_HOST` | SSH host or address for production. Use `bots` only if GitHub Actions can resolve and reach that name; otherwise use the real host from the local SSH alias. |
| `DEPLOY_SSH_PORT` | Optional SSH port. Defaults to `22` when omitted. |
| `DEPLOY_SSH_USER` | SSH deployment user with passwordless `sudo` for systemd operations. |
| `DEPLOY_SSH_PRIVATE_KEY` | Private key allowed to authenticate as the deployment user on the production host. |
| `DEPLOY_SSH_KNOWN_HOSTS` | Pinned known-hosts entry for the production host. |
| `DEPLOY_TARGET_DIR` | Stable absolute host path to the dedicated Nome directory. The final path segment must be `nome`. |
| `DEPLOY_SERVICE_USER` | Optional systemd service user. Defaults to `ubuntu`. |
| `DEPLOY_SERVICE_GROUP` | Optional systemd service group. Defaults to the service user. |

These values are deployment coordinates, not runtime application secrets, but
they remain in GitHub secrets so Actions masks them in evaluated step
environment and script logs. Telegram tokens and other Nome settings must not
be copied into GitHub variables or secrets.

Use a pinned host key rather than disabling SSH host-key checking. For a host
reachable as `bots`, generate the known-hosts value from a trusted machine with:

```bash
ssh-keyscan -H bots
```

## Host Prerequisites

The host uses Ubuntu or another systemd Linux distribution with Python 3.12,
`rsync`, `flock`, `tar`, `bash`, and `sudo`. The SSH deployment user needs:

- write access to `DEPLOY_TARGET_DIR`;
- passwordless `sudo` for installing and restarting `nome.service`;
- outbound network access to install the pinned `uv` bootstrap package when the
  host has not cached it yet.

Before the first workflow deployment, provision this file directly on the host:

```text
<DEPLOY_TARGET_DIR>/.env
```

It must be owned by the service user and have mode `0600`. Deployment only
checks that the file exists; it does not print, upload, replace, or delete it.

## Release Lifecycle

1. GitHub archives the exact checked-out Git revision.
2. The archive is copied to `/tmp/nome-release-<sha>.tar.gz` on the SSH host.
3. The SSH command extracts the archive into a temporary release directory.
4. `scripts/deploy_release.sh` synchronizes tracked files into the stable target
   directory while preserving `.env`, `.venv`, `data/`, deploy metadata,
   Telethon sessions, logs, and SQLite files.
5. The script verifies that `uv.lock` matches project metadata, validates the
   release in a staging virtual environment, compiles `src/nome`, then
   synchronizes the live production virtual environment from the committed
   lockfile, installs the managed systemd unit, and restarts `nome.service`.
6. The release succeeds only when systemd reports the service active and the
   loopback `/healthz` endpoint responds successfully.
7. The deployed revision is recorded in `.deploy/current_release.json`.

Deployments are serialized in GitHub Actions and again on the host with a file
lock. The service is loopback-only: Nome pulls Telegram updates via long
polling, so the systemd unit only needs to bind `127.0.0.1:8000` for the deploy
verifier's `/healthz` probe and never accepts inbound traffic from the network.

The workflow gives the SSH copy and remote deploy command a twenty-minute
execution window. If the GitHub command is interrupted or times out, inspect the
host directly before retrying.

The host script refuses broad parent directories and symlinked target paths. The
target must be a dedicated directory whose final path segment is `nome` before
the destructive `rsync --delete` step can run.

## Operations

Inspect the service on the host with:

```bash
ssh bots 'sudo systemctl status nome --no-pager'
ssh bots 'sudo journalctl -u nome -n 100 --no-pager'
```

Inspect the deployed revision without reading runtime secrets:

```bash
ssh bots 'cat <DEPLOY_TARGET_DIR>/.deploy/current_release.json'
```

A failed workflow reports only the remote deploy script's safe stderr/stdout.
Inspect private service logs on the host, correct the release or host
configuration, then dispatch the workflow again for a revision in `main`.
