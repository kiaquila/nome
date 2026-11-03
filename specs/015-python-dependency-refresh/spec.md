# Feature: Python Dependency Refresh

## Summary

Adopt the grouped Dependabot updates for FastAPI, mypy, pytest-asyncio, and
Ruff while preserving Nome's existing runtime and development behavior.

## Goal

Keep the Python runtime and quality toolchain current with a reproducible,
vulnerability-free lockfile and evidence from the full repository checks.

## Scope

- Update FastAPI to 0.162.0.
- Update mypy to 2.4.1, pytest-asyncio to 1.4.1, and Ruff to 0.17.3.
- Refresh the corresponding `uv.lock` package metadata.
- Incorporate the current `main` dependency graph, including patched
  `pyasn1` 0.6.5.

## Non-Goals

- Changing application or Telegram behavior.
- Changing lint, type-checking, or test configuration.
- Upgrading packages outside the Dependabot group and the inherited security
  fix from `main`.

## Acceptance Criteria

- `pyproject.toml` and `uv.lock` agree on the four updated dependencies.
- `uv.lock` retains patched `pyasn1` 0.6.5 and passes OSV scanning.
- Formatting, linting, type checking, and the full test suite pass.
- Required CI, container build, PR Guard, and AI Review checks pass on the
  final head.
- Every review thread is resolved before merge.
