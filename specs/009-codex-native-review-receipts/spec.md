# Codex Native Review Receipts

## Problem and scope

The native Codex connector now prefixes no-findings receipts with an HTML
marker and updates an existing structured summary. The inherited classifier
and workflow/router filters ignore both signals. A completed gate stays red,
even after the trusted native reviewer has reviewed the current commit.

## Goal

Restore native Codex evidence recognition across the complete CI gate and
wakeup chain while preserving trusted authors, exact-head binding, severity
policy and unresolved findings protection.

## Acceptance Criteria

- Legacy comments and native formal reviews remain supported. New receipts
  require the trusted Codex login, an explicit positive verdict and a matching
  10-character or full reviewed SHA. A structured summary requires a closed,
  typed v1 schema, a completed code review, the full current SHA and explicit
  false findings flags; conflicting or malformed data never passes.
- A new request never hides current-head negative evidence. P0-P2 findings and
  every unresolved review thread block success, including P3/outdated threads.
- Created and edited native comments reach both the workflow and runtime
  router, including a summary created before the request and updated afterward.
- Evidence is checked against the event's exact head before and after API reads.
  A push during evaluation fails the old run rather than validating the new
  head under an old check suite.
- The latest current-head run is reevaluated for new evidence after completion
  and after an active run finishes. Duplicate signals do not restart an attempt
  that already evaluated them; stale heads and old failed runs stay untouched.
- Regression tests run in the Python preflight and CI. Administrative writes
  retain trusted default-branch scripts. Initial read-only validation may use an
  explicitly promoted, independently reviewed immutable gate snapshot, bound to
  the current default SHA. Genuine final-head native review and every configured
  check remain required; no fabricated status, protection bypass or privileged
  PR-code execution.

## Negative scenarios

Wrong/missing/stale SHA; spoofed login; malformed/duplicate markers and JSON keys;
conflicting text/verdicts; pending or negative review; new request after findings;
API or pagination failure; an edit or push racing a gate/rerun; a duplicate signal
following success; a historical failed run behind a successful latest attempt.
