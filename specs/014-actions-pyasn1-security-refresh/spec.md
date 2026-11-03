# Feature: Actions and pyasn1 Security Refresh

## Summary

Adopt the Dependabot-proposed GitHub Actions patch updates while moving the
transitive `pyasn1` lock entry from vulnerable version 0.6.4 to patched version
0.6.5.

## Goal

Keep the repository's automation current without merging a dependency graph
that fails the mandatory vulnerability scan.

## Scope

- Preserve the Dependabot action-pin updates.
- Refresh only the `pyasn1` package entry in `uv.lock`.
- Validate the resulting dependency graph and existing application behavior.

## Non-Goals

- Changing CI job structure or branch-protection policy.
- Changing application or Telegram behavior.
- Upgrading unrelated Python packages.

## Acceptance Criteria

- `uv.lock` resolves `pyasn1` 0.6.5 with its published artifacts and hashes.
- `osv-scan` reports no known vulnerability in the committed dependency graph.
- The repository preflight passes formatting, linting, type checking, and tests.
- Every AI-assisted maintainer commit carries the required Codex co-author
  trailer.
- Required CI, container build, and AI Review checks pass on the final head.
- All review threads are resolved before merge.
