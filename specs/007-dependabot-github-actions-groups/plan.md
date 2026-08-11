# Plan

## Configuration

Update `.github/dependabot.yml` in place. For the `github-actions` entry,
remove only `semver-major-days`, `semver-minor-days`, and
`semver-patch-days`; retain `default-days: 7`.

Under both `github-actions` and `uv`, add an identically named
`minor-and-patch` group with `minor` and `patch` update types. Dependabot
interprets groups within their enclosing ecosystem, so this does not combine
GitHub Action and Python dependency updates.

## Verification

- Parse the YAML and assert the requested cooldown and group structure.
- Run `uv run python scripts/preflight.py`.
- Review the final diff to ensure it contains configuration and feature-memory
  documentation only, with no dependency or lockfile changes.
