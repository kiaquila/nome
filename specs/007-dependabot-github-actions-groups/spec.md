# Feature: Dependabot GitHub Actions Update Grouping

## Summary

Dependabot configuration for the `github-actions` ecosystem used cooldown
options that Dependabot does not support. This change preserves the supported
default cooldown and groups routine action updates into one pull request.

## Goal

Keep Dependabot's GitHub Actions configuration valid while reducing minor and
patch update noise separately for each configured package ecosystem.

## Scope

- Remove unsupported SemVer-specific cooldown settings from `github-actions`.
- Retain `default-days` for `github-actions`.
- Add a `minor-and-patch` update group to `github-actions` and `uv`.

## Non-Goals

- Updating any dependency, lockfile, workflow action, or Python package.
- Changing Dependabot schedules, labels, limits, or commit-message settings.
- Changing the `uv` SemVer-specific cooldown values, which Dependabot supports.

## Acceptance Criteria

- The `github-actions` cooldown contains only `default-days`.
- `github-actions` and `uv` each group minor and patch version updates within
  their own ecosystem.
- `.github/dependabot.yml` is valid YAML and the repository preflight passes.
