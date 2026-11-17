# Plan: FastAPI and OpenTelemetry Security Refresh

## Approach

Keep the Dependabot manifest and lockfile changes intact and regenerate only
the vulnerable `opentelemetry-api` entry. Add the feature memory required when
a maintainer extends an automated dependency pull request.

## Steps

1. Preserve the Dependabot FastAPI and Ruff updates.
2. Upgrade only `opentelemetry-api` from 1.45.1 to patched version 1.45.2.
3. Run `uv run python scripts/preflight.py`.
4. Verify OSV scanning, CI, container build, PR Guard, and AI Review on GitHub.
5. Resolve every review thread, wait two minutes, and merge only while the final
   head remains mergeable and green.

## Risks

- A transitive dependency update can change runtime behavior. The update is a
  patch release and the full test suite covers the existing behavior.
- Lock generation can rewrite unrelated resolver metadata. The committed diff
  is restricted to the `opentelemetry-api` package entry.

## Verification

- `uv run python scripts/preflight.py`
- GitHub `osv-scan`, `baseline-checks`, `container-build`, `guard`, and
  `AI Review`
- GitHub mergeability and review-thread resolution on the final head

## Rollback

Revert the pull request to restore the previous FastAPI and Ruff versions and
the `opentelemetry-api` 1.45.1 lock entry.
