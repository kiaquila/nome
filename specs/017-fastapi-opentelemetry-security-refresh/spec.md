# Feature: FastAPI and OpenTelemetry Security Refresh

## Summary

Adopt the Dependabot-proposed FastAPI and Ruff updates while moving the
transitive `opentelemetry-api` lock entry from vulnerable version 1.45.1 to
patched version 1.45.2.

## Goal

Keep the runtime and development toolchain current without merging a dependency
graph that fails the mandatory vulnerability scan.

## Scope

- Preserve the Dependabot FastAPI and Ruff updates.
- Refresh only the vulnerable `opentelemetry-api` package entry in `uv.lock`.
- Validate the resulting dependency graph and existing application behavior.

## Non-Goals

- Changing application or Telegram behavior.
- Changing lint, type-checking, CI, or branch-protection configuration.
- Upgrading unrelated Python packages.

## Acceptance Criteria

- `uv.lock` resolves `opentelemetry-api` 1.45.2 with its published artifacts
  and hashes.
- `osv-scan` reports no known vulnerability in the committed dependency graph.
- The repository preflight passes formatting, linting, type checking, and tests.
- Every AI-assisted maintainer commit carries the required Codex co-author
  trailer.
- Required CI, container build, PR Guard, and AI Review checks pass on the
  final head.
- All review threads are resolved before merge.
