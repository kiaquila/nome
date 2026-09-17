# Feature: Ruff 0.16.7 Toolchain Update

## Summary

Update Nome's development linting and formatting tool from Ruff 0.16.6 to
Ruff 0.16.7 while keeping the runtime dependency set and lint policy unchanged.

## Goal

Adopt the Ruff 0.16.7 patch release with a reproducible lockfile and prove that
the repository remains formatted, lint-clean, type-safe, and fully tested.

## Scope

- Raise the Ruff development dependency floor from 0.16.6 to 0.16.7.
- Refresh only Ruff's package metadata and artifacts in `uv.lock`.
- Validate the update with the repository's existing quality and test checks.

## Non-Goals

- Changing Ruff rule selection, preview mode, target Python version, or line
  length.
- Changing application behavior or runtime dependencies.
- Adopting a Ruff major release.

## Acceptance Criteria

- `pyproject.toml` requires `ruff>=0.16.7,<1.0.0` in the `dev` group.
- `uv.lock` resolves Ruff 0.16.7 and remains valid under `uv lock --check`.
- Ruff is the only package version changed by this update.
- Ruff format and lint checks, mypy, and the full pytest suite pass.
- Repository baseline, context-budget, feature-memory, OSV, and AI review gates
pass before merge.
