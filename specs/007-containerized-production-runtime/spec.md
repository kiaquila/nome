# Feature: Containerized Production Runtime

## Summary

Nome currently runs directly from a host virtual environment under
`nome.service`. Production releases should instead run as one Docker container
named `nome`, while merges to `main` continue to deploy automatically through
the existing SSH workflow.

The first container release may stop and retire the legacy systemd process.
After that migration, each successful release keeps only the running image and
the immediately previous healthy image; older Nome images are removed without
pruning images owned by other services on the shared host.

## Goal

Make the production runtime immutable and self-contained, preserve host-owned
secrets and SQLite state, and keep one known-good Docker image available for
automatic rollback and operator recovery.

## Scope

- Add a production Dockerfile for Python 3.12 and the locked Nome dependencies.
- Build an image tagged `nome:<full-release-sha>` in GitHub Actions for every
  production deployment.
- Transfer the image and release bootstrap over the existing strict SSH path.
- Run exactly one container named `nome` with:
  - host-local port `127.0.0.1:8000` mapped to the container health endpoint;
  - host-owned `.env` loaded at runtime without copying it into the image;
  - host-owned `data/` bind-mounted for SQLite persistence;
  - the service account's numeric UID/GID and a read-only root filesystem;
  - a Docker health check and `unless-stopped` restart policy.
- On the first release, stop the legacy `nome.service` immediately before the
  container starts and remove the unit only after the container is healthy.
- On later releases, replace the current container and automatically restore
  its previous healthy image if the candidate fails health verification.
- After a successful release, retain only the current and previous managed Nome
  image IDs and delete all older images carrying the Nome management label.
- Record current and previous image metadata in the host-local deploy state.
- Document container operations and migration behavior.

## Non-Goals

- Preserving the host virtual environment or supporting the old systemd runtime
  after the first successful container release.
- Publishing images to a registry.
- Running more than one Nome replica or overlapping Telegram polling workers.
- Pruning global Docker images, layers, volumes, or build cache used by other
  applications on the production host.
- Moving runtime secrets or SQLite data into GitHub.

## Acceptance Criteria

- AC-001: A push to `main` builds an image for the exact merged SHA and deploys
  it through the existing serialized SSH workflow.
- AC-002: Production runs one Docker container named `nome`; no active
  `nome.service` process remains after the first successful container deploy.
- AC-003: The image contains no runtime `.env`, database, Telegram session, or
  other host-private data.
- AC-004: The container loads the host `.env`, persists SQLite under the
  bind-mounted host `data/` directory, runs as the service UID/GID, exposes only
  `127.0.0.1:8000`, and reports healthy before a deploy succeeds.
- AC-005: A failed first container start restores the previously active legacy
  service; a failed later candidate restores the previous healthy image as the
  `nome` container and leaves deployment metadata on the stable release.
- AC-006: After the second and later successful releases, Docker retains the
  running Nome image and its immediate predecessor only. Cleanup selects images
  by Nome's management label and does not use global prune commands.
- AC-007: The Docker image build is exercised by pull-request CI, shell syntax
  validation passes, and `uv run python scripts/preflight.py` passes.
- AC-008: Deployment logs do not print `.env`, database content, Telegram
  identifiers, container logs, or private host paths.

## Privacy And Operational Safety

- Runtime secrets enter only through Docker's host-side `--env-file` handling.
- The database mount is the only persistent application write path; the
  container root filesystem is read-only and `/tmp` is an ephemeral tmpfs.
- Candidate and rollback health failures report only safe container state.
  Private application logs remain on the host.
- The host lock and GitHub concurrency group continue to serialize releases so
  two Telegram polling consumers are never intentionally active together.
