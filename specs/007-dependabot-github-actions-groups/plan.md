# Plan

## Configuration

Update `.github/dependabot.yml` in place. For the `github-actions` entry,
remove only `semver-major-days`, `semver-minor-days`, and
`semver-patch-days`; retain `default-days: 7`.

Under both `github-actions` and `uv`, add an identically named
`minor-and-patch` group with `minor` and `patch` update types. Dependabot
interprets groups within their enclosing ecosystem, so this does not combine
GitHub Action and Python dependency updates.

The existing OSV scan reports three advisories against transitive `pyasn1`
`0.6.3`. Run `uv lock --upgrade-package pyasn1` to update only that lockfile
entry to `0.6.4`; do not update a direct dependency or any unrelated package.

## Verification

- Parse the YAML and assert the requested cooldown and group structure.
- Run the OSV scanner against the updated lockfile.
- Run `uv run python scripts/preflight.py`.
- Review the final diff to ensure it contains configuration and feature-memory
  documentation plus the targeted `pyasn1` lockfile remediation only.
