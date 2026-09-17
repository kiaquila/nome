# Plan: Ruff 0.16.7 Toolchain Update

## Approach

Keep the Dependabot-generated dependency change intact and add only the feature
memory required for a maintainer-restored pull request. No lint configuration or
application code changes are needed.

## Components

1. `pyproject.toml`
   - Raise the Ruff lower bound to 0.16.7 while retaining the `<1.0.0` cap.

2. `uv.lock`
   - Update the root dev constraint and Ruff's 0.16.7 source and wheel metadata.
   - Keep every other locked package unchanged.

3. Verification
   - Run `uv lock --check`.
   - Run Ruff formatting and lint checks, mypy, and pytest through the repository
     preflight command.
   - Verify GitHub CI, OSV, PR Guard, and AI Review before merge.

## Risks

- A patch release can change diagnostics. The configured rule set is exercised
  against the whole repository before merge.
- Incorrect lock metadata could make development environments platform-specific.
  The generated lock entries retain hashes for every supported Ruff artifact.

## Verification

- `uv lock --check`
- `uv run ruff format --check .`
- `uv run ruff check .`
- `uv run mypy src`
- `uv run pytest`
- `uv run python scripts/preflight.py`
- GitHub CI, OSV Scan, PR Guard, and AI Review all succeed on the final head.

## Rollback

Revert the pull request to restore the Ruff 0.16.6 constraint and lock entries.
