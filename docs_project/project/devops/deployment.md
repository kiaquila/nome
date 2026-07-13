# Production Deployment

## Overview

Nome deploys to one production host over SSH from GitHub Actions. The workflow
cross-builds the selected revision for `linux/arm64` as
`nome:<full-release-sha>`, exports the image with
`docker image save`, copies it and a `git archive` bootstrap to the SSH target,
and invokes `scripts/deploy_release.sh`. Production runs one Docker container
named `nome`; application source and dependencies execute from the image.

The workflow is defined in `.github/workflows/deploy.yml`. It runs after a push
to `main` and can also be dispatched manually for a revision already contained
in `main` history. The production host is reached operationally as `ssh bots`.

GitHub logs keep deployment coordinates in masked repository secrets. The
host's runtime `.env`, SQLite data, private sessions, and deploy metadata remain
on the server. They are never added to the image or transferred to GitHub.

The workflow also records a GitHub Deployment for the `production` environment:
it opens the deployment in `in_progress` before the image build and closes it as
`success` or `failure` from the final job status. These records populate the
repository **Deployments** section and `production` environment view.

## GitHub Secrets

Define these repository-level GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `DEPLOY_SSH_HOST` | SSH host or address for production. Use `bots` only if GitHub Actions can resolve and reach that name; otherwise use the real host from the local SSH alias. |
| `DEPLOY_SSH_PORT` | Optional SSH port. Defaults to `22` when omitted. |
| `DEPLOY_SSH_USER` | SSH deployment user. It normally matches the service user. |
| `DEPLOY_SSH_PRIVATE_KEY` | Private key allowed to authenticate as the deployment user. |
| `DEPLOY_SSH_KNOWN_HOSTS` | Pinned known-hosts entry for the production host. |
| `DEPLOY_TARGET_DIR` | Stable absolute host path to Nome's private state directory. The final path segment must be `nome`. |
| `DEPLOY_SERVICE_USER` | Host account whose UID/GID runs inside the container. Defaults to `ubuntu`. |
| `DEPLOY_SERVICE_GROUP` | Optional runtime group. Defaults to the service user. |

These values are deployment coordinates rather than runtime application
secrets, but they remain in GitHub secrets so Actions masks them in evaluated
step environments and script logs. Telegram tokens and other Nome settings must
not be copied into GitHub variables or secrets.

Use a pinned host key rather than disabling SSH host-key checking. Generate the
known-hosts value from a trusted machine with `ssh-keyscan` for the production
hostname or address.

## Host Prerequisites

The host needs Docker Engine, Python 3, `bash`, `flock`, `tar`, and `sudo`. The
service user must:

- own and be able to write `DEPLOY_TARGET_DIR`, `data/`, and `.deploy/`;
- be able to read the mode-`0600` runtime `.env`;
- access the Docker daemon, normally through membership in the `docker` group;
- have passwordless `sudo` for inspecting, stopping, disabling, and removing the
  legacy `nome.service` during the first container migration.

The SSH account should normally be the service user. If it differs, it must be
able to run the extracted bootstrap as `DEPLOY_SERVICE_USER` through
passwordless `sudo -u`. The workflow makes its temporary archives readable by
that account, then removes them after the deploy attempt.

Before the first workflow deployment, provision the runtime environment file
directly on the host:

```text
<DEPLOY_TARGET_DIR>/.env
```

The deploy script checks the file and restores mode `0600`; it never prints,
uploads, replaces, or deletes the file. `NOME_DATABASE_PATH` is overridden
inside the container to `/app/data/nome.sqlite3`, which maps to the persistent
host `data/` directory.

## Container Runtime

The production image uses a digest-pinned official Python 3.12 slim base and a
locked, non-editable runtime environment. The running container is created with:

- the exact name `nome` and image tag `nome:<release-sha>`;
- numeric UID/GID resolved from the service account;
- `--restart unless-stopped` and a 30-second stop timeout;
- a read-only root filesystem, a small ephemeral `/tmp`, all Linux capabilities
  dropped, `no-new-privileges`, and a process-count limit;
- the host `.env` loaded through `--env-file` and only `data/` bind-mounted;
- `127.0.0.1:8000:8000`, so the health endpoint is not published externally;
- bounded local JSON logs and an image-defined `/healthz` Docker health check.

Nome is intentionally a single container. Two instances would compete for the
single Telegram `getUpdates` stream and run duplicate schedulers.

## Release Lifecycle

1. GitHub validates that the selected revision belongs to `main` history.
2. The runner builds `nome:<release-sha>`, verifies the Nome/revision labels,
   exports the image, and creates a source bootstrap archive.
3. Both archives are copied to unique `/tmp` paths on the SSH host.
4. The host deploy script takes the Nome deploy lock, validates private state
   and Docker access, loads the image, verifies the same labels again, and
   rejects an OS/architecture mismatch before stopping the active runtime.
5. The current runtime is stopped only after the candidate image is ready. On
   the first migration this is `nome.service`; later it is the existing managed
   `nome` container.
6. The candidate starts with the hardened runtime arguments above. The deploy
   succeeds only after Docker reports it `healthy`.
7. If the first candidate fails, the old systemd service is restarted. If a
   later candidate fails, the prior container image is recreated as `nome` and
   checked for health. The workflow still fails so the attempted release is
   visible as unsuccessful.
8. After success, the legacy systemd unit is disabled and removed. Image cleanup
   selects only `io.nome.managed=true` images and retains the running image plus
   its immediate healthy predecessor. No global Docker prune runs.
9. `.deploy/current_release.json` is atomically replaced with the release,
   current image, previous image, container name, and UTC deployment time.

The first successful container release has no previous Docker image, so only
its current image remains. Starting with the second successful container
release, exactly two Nome image IDs remain. A manual redeploy of the same SHA
keeps the already recorded predecessor instead of collapsing the rollback slot.

## Operations

Inspect the runtime without reading secrets or application logs:

```bash
ssh bots 'docker ps --filter name=^/nome$ --format "{{.Names}} {{.Image}} {{.Status}}"'
ssh bots 'docker inspect --format "{{.State.Status}} {{.State.Health.Status}}" nome'
ssh bots 'docker image ls --filter label=io.nome.managed=true'
```

Inspect the deployed revision from the host-local metadata:

```bash
ssh bots 'cat <DEPLOY_TARGET_DIR>/.deploy/current_release.json'
```

Container logs may contain private operational context. Inspect them only on the
host when necessary; the deployment workflow intentionally does not stream
`docker logs` to GitHub.

To redeploy or roll back operationally, dispatch **Deploy Production** for a
revision contained in `main` history. The same health, rollback, retention, and
metadata rules apply. If a deploy fails, inspect `.deploy/last_deploy.log` and
container logs directly on the host before retrying.
