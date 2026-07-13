# Plan

## Image Build And Delivery

Add a multi-stage Dockerfile based on a digest-pinned official Python 3.12 slim
image. The builder installs the same pinned `uv` version used by production,
checks `uv.lock`, and synchronizes only locked runtime dependencies into a
virtual environment. The runtime stage copies that environment, runs as a
non-root default user, binds Uvicorn to the container interface, and defines an
internal `/healthz` probe.

The deploy workflow builds `nome:<release-sha>` on the GitHub runner and sets
OCI/Nome labels with the full revision. It exports the image with `docker save`,
compresses it, and transfers it beside the existing `git archive`. Building on
the runner avoids adding project-specific BuildKit cache to the shared host.

## Host Runtime

Replace the virtualenv/systemd release application in
`scripts/deploy_release.sh` with a Docker lifecycle:

1. Validate the target, release SHA, image archive, service identity, Docker
   access, `.env`, and writable persistent directories before stopping anything.
2. Load the candidate image privately and verify its management/revision labels.
3. Detect the currently healthy managed `nome` container, or the active legacy
   systemd service on the first migration.
4. Stop that runtime, start the candidate with one shared array of hardened
   `docker run` arguments, and wait for Docker health to become `healthy`.
5. On failure, remove the candidate container and restore the prior Docker image
   or restart the legacy service. Exit non-zero after recovery so GitHub records
   the failed release.
6. On success, retire the old systemd unit, keep the candidate image plus the
   prior healthy container image, and remove every other image selected by the
   `io.nome.managed=true` label.
7. Atomically write current/previous image metadata only after health and
   retention succeed.

The stable host directory remains the state boundary: `.env`, `data/`, `.deploy/`,
and private logs stay host-owned. Application source and dependencies execute
only from the image. The container overrides `NOME_DATABASE_PATH` to the mounted
`/app/data/nome.sqlite3`, so legacy host-relative or host-absolute values cannot
redirect the container away from persistent storage.

## Verification

- Add fake-Docker lifecycle tests for first migration, subsequent retention, and
  failed-candidate rollback without real secrets or host mutation.
- Add a CI image-build job and validate the deploy workflow with `actionlint`.
- Run `bash -n scripts/deploy_release.sh`.
- Build and inspect the production image locally.
- Run `uv run python scripts/preflight.py`.
- After merge, confirm `docker ps`, image retention, release metadata, health,
  the stopped legacy unit, and the GitHub Deployment result on the server.
