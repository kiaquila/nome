# Feature: Dependabot Feature-Memory Exemption

## Summary

Every Dependabot pull request fails the required `guard` and `baseline-checks`
gates. The feature-memory check treats `pyproject.toml`, `uv.lock`, and
`.github/` as product paths, so an automated version bump is asked for a
`specs/<feature-id>/{spec,plan,tasks}.md` folder it can never provide. Eight
open dependency pull requests are blocked on this, and every future one would
be too.

## Goal

Let automated dependency bumps clear the feature-memory gate without weakening
the requirement for human product changes.

## Scope

- Add `featureMemoryExemptActors` and `dependencyManifestPaths` to
  `.unicorn-hub/config.json`.
- Exempt a pull request from the feature-memory requirement only when its
  author is a configured automation actor, the event that produced the revision
  was sent by that actor, every commit in the range is authored by that actor,
  every changed file is a dependency manifest, a lockfile, or a workflow file,
  **and** every authored change only moves a version without changing which
  action or package it names.
- Apply the same rule in `scripts/check_feature_memory.py` (used by
  `baseline-checks` via preflight) and `scripts/check-feature-memory.mjs`
  (used by `guard` from the default branch).
- Read the exemption policy from the checkout that owns the gate script, so a
  pull request cannot grant itself the exemption through its own config.
- Cover the rule with regression tests.

## Non-Goals

- Removing any path from `productPaths`.
- Changing the required-check set, branch protection, or the AI Review gate.
- Exempting any other automation actor than the configured Dependabot login.

## Acceptance Criteria

- A pull request authored by `dependabot[bot]` that touches only
  `pyproject.toml` and `uv.lock`, or only files under `.github/workflows/`,
  passes the feature-memory gate.
- A pull request authored by a human that touches the same files still fails
  the gate without a complete `specs/<feature-id>/` folder.
- A pull request authored by `dependabot[bot]` that also touches `src/` still
  fails the gate.
- The pull request author is read from the GitHub event payload, so the rule
  works without editing any workflow file.
- A pull request that adds its own author to `featureMemoryExemptActors` and
  widens `dependencyManifestPaths` in its own `.unicorn-hub/config.json` still
  fails the `guard` gate.
- A maintainer commit pushed onto an open Dependabot branch fails the gate even
  though the pull request author is still `dependabot[bot]` and the changed file
  is on the manifest list.
- With two automation actors configured, a pull request opened by one of them
  whose range contains a commit authored by the other still fails the gate.
- A maintainer reopening an otherwise untouched Dependabot pull request does not
  break the exemption, because reopening produces no revision.
- A workflow change that is not purely an action-pin bump fails the gate even
  when the commit claims Dependabot as its author, since commit author names are
  a user-controlled field.
- Replacing a trusted action with a different one fails the gate even though
  both the old and new lines are `uses:` pins, and two steps exchanging actions
  fails even though the patch as a whole names the same coordinates.
- A `pyproject.toml` edit outside a dependency specifier — a build backend or an
  entry point — fails the gate, as does renaming the package a specifier names.
- `dependencyManifestPaths` lists only what the configured Dependabot ecosystems
  touch: `pyproject.toml`, `uv.lock`, and `.github/workflows/`.
- A reopened pull request that touches a lockfile fails the gate, because a
  generated file carries no authored line whose content could establish
  provenance.
- The exemption is computed from the merge base, so a Dependabot pull request
  keeps it after the base branch advances.
- The exemption fails closed when provenance cannot be determined, including
  when the run is not a pull request event at all; an ambient `GITHUB_ACTOR`
  never grants it.
