# Plan: Actions Dependency Security Refresh

## Approach

Keep the Dependabot action-pin changes intact and update only the vulnerable
transitive package in `uv.lock`. Regenerating the lock entry with uv preserves
the resolver's Python-version markers: Python versions below 3.15 use the first
patched `anyio` release, while newer versions use the compatible current
release.

## Steps

1. Apply the Dependabot action-pin updates.
2. Run `uv lock --upgrade-package anyio`.
3. Run `uv run python scripts/preflight.py`.
4. Verify `osv-scan`, CI, container build, and AI Review on GitHub.

## Risks

- A transitive dependency update can change runtime behavior. The update is
  constrained to patch-compatible `anyio` releases and covered by the full test
  suite.
- Lock resolution differs by Python version. The generated markers remain in
  the lockfile and CI validates the supported runtime.

## Verification

- Local preflight completes successfully, including 105 tests.
- GitHub OSV scanning completes without findings.
- All required pull-request checks pass on the final head.
