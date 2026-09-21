# Feature: Actions Dependency Security Refresh

## Summary

Refresh the pinned GitHub Actions dependencies while keeping the repository's
dependency scan green. The updated OSV scanner exposed known vulnerabilities in
the transitive `anyio` version recorded in `uv.lock`, so the lockfile must move
to patched releases in the same pull request.

## Goal

Adopt the Dependabot-proposed action pins without merging a dependency graph
that fails the repository's vulnerability gate.

## Scope

- Update the pinned `astral-sh/setup-uv` and OSV scanner action revisions.
- Regenerate `uv.lock` so supported Python versions resolve to non-vulnerable
  `anyio` releases.
- Preserve application behavior and dependency constraints.

## Non-Goals

- Changing the CI job structure or branch-protection policy.
- Adding application features or changing Telegram behavior.
- Broadly upgrading unrelated Python packages.

## Acceptance Criteria

- `osv-scan` reports no known vulnerability in the committed dependency graph.
- The repository preflight passes formatting, linting, type checking, and tests.
- The container build and existing CI checks remain green.
- AI Review passes for the final pull-request head and has no unresolved review
  threads.
