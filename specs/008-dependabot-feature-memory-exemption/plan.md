# Plan: Dependabot Feature-Memory Exemption

## Approach

The exemption lives in the gate scripts rather than in `productPaths`, so the
governance surface stays intact for humans. Both conditions are required —
trusted author and dependency-only diff — so neither a spoofed path list nor an
unexpected Dependabot diff can bypass the spec requirement on its own.

`guard` runs the default-branch copy of the gate script against a workspace
that holds pull request content, and `findRepoRoot()` resolves that workspace.
The exemption policy is therefore read from `repositoryRoot` — the checkout that
owns the script — rather than from the inspected workspace. Otherwise a pull
request could add its own author to `featureMemoryExemptActors`, list every file
it touches in `dependencyManifestPaths`, and clear the trusted gate with no spec
folder. `scripts/check_feature_memory.py` already resolves its config relative to
its own location; `baseline-checks` runs entirely from the pull request checkout,
so `guard` is the trust boundary.

`pull_request.user.login` alone is not enough: it stays `dependabot[bot]` after
a maintainer pushes onto the bot's branch, which would extend the exemption to
that maintainer's edits — including arbitrary workflow content, not just action
pins. The gate therefore also requires the `sender` of a revision-producing event
(`opened`, `synchronize`) to equal the pull request author, and checks that every
non-merge commit in the range is authored by that same actor — compared against the actor itself, not against
the exemption list, so configuring a second automation login cannot let a
mixed-actor range through. The sender is only meaningful for actions that create a revision: `pr-guard.yml`
and `ci.yml` subscribe to the default `pull_request` types, which include
`reopened`, and GitHub names whoever reopened the pull request as the sender
there. Treating that person as the producer would demand feature memory for an
untouched bot bump. On those actions provenance rests on commit authorship,
which is checked unconditionally.

Commit authorship is not authenticated, though: `%an` is a user-controlled field,
so a maintainer could push workflow edits under a spoofed Dependabot author name
and reopen the pull request to skip the sender comparison. Identity is therefore
not the load-bearing control for the dangerous file class. Authored files clear
the exemption only when every changed line declares a version and names the same
thing on both sides: `uses: <action>@<ref>` for workflows, a dependency
specifier for `pyproject.toml`. Removed and added lines are paired positionally
inside each hunk, so two steps exchanging actions cannot cancel out the way a
whole-patch comparison would. A line-shape rule alone would not do:
`uses: actions/checkout@sha` and `uses: attacker/action@main` both look like
pins, so a version may move but the action or package may never change.

`pyproject.toml` needs this as much as workflows do — it carries the build
backend and entry points, not only dependency specifiers. Lockfiles are exempt
from content validation because they are generated artifacts rather than
authored ones — which leaves them with no line to check, so they instead require
the event to establish provenance: the invariant is that a file is either
content-inspectable or covered by a bot-sent revision-producing event. A reopen
therefore keeps the exemption for a workflow pin bump but loses it for a
lockfile, failing closed until the bot pushes again. `dependencyManifestPaths` was also narrowed to what the two
configured Dependabot ecosystems actually touch: `package.json` here declares no
dependencies at all, only scripts, so listing it was pure attack surface. Spoofing an author name then buys nothing beyond
dependency-version changes, which is what the exemption exists for and what
`osv-scan`, `container-build`, and the AI review still cover.

Outside a `pull_request` event the exemption is denied outright: provenance is
established, never assumed, so an ambient `GITHUB_ACTOR` cannot grant it. Merge commits are skipped because `pull_request`
runs check out a merge commit that GitHub creates. Dependabot commits carry
author `dependabot[bot]` and committer `GitHub`, so only the author is compared.

The author is resolved from `GITHUB_EVENT_PATH`
(`pull_request.user.login`), falling back to `GITHUB_ACTOR`. Reading the event
payload avoids passing a new environment variable through the workflows, which
matters because `pull_request` runs use the workflow file from the pull request
branch — open Dependabot branches would not have the new variable.

## Steps

1. Add `featureMemoryExemptActors` and `dependencyManifestPaths` to
   `.unicorn-hub/config.json`, with defaults mirrored in both scripts.
2. Add `_is_exempt_dependency_update` to `scripts/check_feature_memory.py` and
   run it after the product-path test, before the specs lookup.
3. Mirror the rule as `isExemptDependencyUpdate` in
   `scripts/check-feature-memory.mjs`.
4. Add regression tests in `tests/test_check_feature_memory.py`.
5. Run `uv run python scripts/preflight.py`.

## Risks

- Reading `GITHUB_ACTOR` as a fallback is looser than the event payload. It is
  only a fallback, it is set by the runner rather than by the pull request, and
  the dependency-only path test still has to pass.
- `.github/workflows/` is exempt only for the automation actor; a human
  changing a workflow still needs feature memory.

## Verification

- `uv run python scripts/preflight.py` passes: ruff format, ruff check, mypy,
  86 pytest tests (six new), feature memory, repository baseline, and context
  budget.
- New regression tests cover the exempt case, the human-author case, the mixed
  diff that reaches beyond manifests, the empty diff, and author resolution from
  the GitHub event payload.
- Gate script exercised against the real bump branches with realistic event
  payloads: a bot author with a bot sender on `synchronize` passes; the same
  branch with a human sender on `synchronize` fails; a human sender on
  `reopened` passes; and with no event payload at all it fails, even with
  `GITHUB_ACTOR` set to the bot.
- Laundering attempts reproduced end to end against the real head of the
  workflow-pin branch, each committed with `--author='dependabot[bot] <...>'`
  and evaluated under a `reopened` event with a human sender: adding a `run:`
  step, replacing a trusted action with a third-party one, and exchanging the
  actions of two steps. The gate rejects all three.
- All eight open dependency branches evaluated with a bot `synchronize` payload
  against an *advanced* base that already contains this change — the real
  post-merge state: every one passes. Against the same base, a two-endpoint diff
  reports this pull request's own files as part of each bot branch.
- Maintainer-on-bot-branch attempt reproduced end to end: a commit authored by
  the maintainer appended to the real head of the `uv` bump branch, editing
  `.github/workflows/ci.yml`. The gate fails it while the unmodified bot branch
  still passes.
- Config-injection attempt reproduced end to end: a clone whose
  `.unicorn-hub/config.json` names an attacker login in
  `featureMemoryExemptActors` and lists `src/` in `dependencyManifestPaths`, with
  a `src/nome/app.py` edit and no spec folder. The pre-fix gate script passed it;
  the current script fails it with the standard feature-memory error.
- `node scripts/check-feature-memory.mjs` run against the real head commits of
  the open dependency pull requests: the manifest bump and the workflow pin bump
  both pass with the Dependabot actor, and the same manifest diff still fails
  with a human actor.

## Diff range

Both gates compute the exemption from the merge base (`base...head`). A
two-endpoint diff would report commits the base branch gained after the branch
was cut as part of the pull request, so every open Dependabot branch would lose
the exemption the moment `main` advanced — including on the very merge that
introduces this change.

## Rollout

Merge to `main` first. `guard` picks the fix up immediately because it runs the
default-branch copy of the script. `baseline-checks` runs the pull request copy,
so each open Dependabot pull request needs a rebase onto the updated `main`
before it goes green.
