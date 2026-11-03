# Plan: Actions and pyasn1 Security Refresh

## Approach

Keep the Dependabot action-pin changes intact and regenerate only the vulnerable
transitive `pyasn1` entry. Add the feature memory required when a maintainer
extends an automated dependency pull request.

## Steps

1. Apply the Dependabot action-pin updates.
2. Run `uv lock --upgrade-package pyasn1` and retain only the `pyasn1` lock
   metadata change.
3. Run `uv run python scripts/preflight.py`.
4. Verify OSV scanning, CI, container build, PR Guard, and AI Review on GitHub.
5. Resolve every review thread, wait two minutes, and merge only while the final
   head remains mergeable and green.

## Risks

- A transitive dependency update can change runtime behavior. The update is a
  patch release and the full test suite covers the existing behavior.
- Lock generation can rewrite unrelated resolver metadata. The committed diff
  is restricted to the `pyasn1` package entry.

## Verification

- Local preflight completes successfully, including 105 tests.
- GitHub OSV scanning completes without findings.
- All required pull-request checks pass on the final head.

## Rollback

Revert the pull request to restore the previous action pins and `pyasn1` 0.6.4
lock entry.
