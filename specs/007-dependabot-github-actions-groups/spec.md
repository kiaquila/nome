# Feature: Dependabot GitHub Actions Update Grouping

## Summary

Dependabot configuration for the `github-actions` ecosystem used cooldown
options that Dependabot does not support. This change preserves the supported
default cooldown and groups routine action updates into one pull request. It
also remediates the existing OSV finding in the lockfile so the PR's security
gate passes.

## Goal

Keep Dependabot's GitHub Actions configuration valid while reducing minor and
patch update noise separately for each configured package ecosystem, and keep
the locked Python dependency set free of the reported `pyasn1` vulnerability.

## Scope

- Remove unsupported SemVer-specific cooldown settings from `github-actions`.
- Retain `default-days` for `github-actions`.
- Add a `minor-and-patch` update group to `github-actions` and `uv`.
- Upgrade the transitive `pyasn1` lockfile entry to its OSV-fixed version.

## Non-Goals

- Updating direct dependencies, workflow action versions, or unrelated locked
  packages.
- Changing Dependabot schedules, labels, limits, or commit-message settings.
- Changing the `uv` SemVer-specific cooldown values, which Dependabot supports.

## Acceptance Criteria

- The `github-actions` cooldown contains only `default-days`.
- `github-actions` and `uv` each group minor and patch version updates within
  their own ecosystem.
- `uv.lock` resolves `pyasn1` to `0.6.4`, the fixed version reported by OSV.
- `.github/dependabot.yml` is valid YAML and the repository preflight passes.
