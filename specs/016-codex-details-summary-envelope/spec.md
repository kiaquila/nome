# Codex details summary envelope

## Goal

Accept the current native Codex structured review summary without weakening the
fail-closed AI Review gate.

## Scope

The trusted review parser, its regression suite, and the review contract. Nome
application behavior and GitHub protection settings are unchanged.

## Acceptance Criteria

- The exact native outer `details` summary envelope can approve a completed,
  clean, current-head structured verdict.
- The legacy Markdown heading envelope remains supported.
- Wrapper/status disagreement, malformed wrappers, trailing content, findings,
  foreign commits, and unresolved threads remain blocking.
- The repository preflight and a native current-head review pass before merge.

## Negative Scenarios

A forged wrapper says Completed while typed state is running, omits its closing
tag, appends content after the wrapper, or contains a blocking finding. None of
those presentations can approve the pull request.
