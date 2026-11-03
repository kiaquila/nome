# Plan: Python Dependency Refresh

## Approach

Keep the Dependabot-generated manifest and lockfile changes intact, merge the
current `main` dependency graph, and add the feature memory required for a
maintainer-updated dependency pull request.

## Steps

1. Preserve the grouped FastAPI, mypy, pytest-asyncio, and Ruff updates.
2. Merge current `main` so the lockfile inherits patched `pyasn1` 0.6.5.
3. Run `uv run python scripts/preflight.py`.
4. Verify OSV scanning, CI, container build, PR Guard, and AI Review on GitHub.
5. Resolve all review threads, wait two minutes, and merge only while the final
   head remains mergeable and green.

## Risks

- FastAPI spans several minor releases and includes request-validation behavior
  changes. The full application test suite validates Nome's exercised paths.
- Tool updates can change diagnostics. Ruff and mypy run across the repository
  before merge.
- Lockfile merges can retain a stale vulnerable transitive version. The final
  lockfile and OSV job explicitly verify `pyasn1` 0.6.5.

## Verification

- `uv run python scripts/preflight.py`
- GitHub `osv-scan`, `baseline-checks`, `container-build`, `guard`, and
  `AI Review`
- GitHub mergeability and review-thread resolution on the final head

## Rollback

Revert the pull request to restore the previous dependency constraints and
locked artifacts.
