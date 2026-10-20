# Static Codex receipt timestamps

## Goal
Prevent edits to a static clean receipt from renewing approval freshness or superseding later pending structured state.

## Acceptance Criteria
- Positive static receipts and legacy verdicts use creation time for freshness and ordering.
- Structured positives retain code-row completion time.
- Invalid, pending and negative signals retain edit time and conservative same-second ordering.
- A pre-request positive receipt edited afterward cannot pass.
- Mandatory preflight and native final-head review pass before merge.

## Negative scenarios
Old clean receipt edited after a new request; old clean receipt edited after a later pending machine state; SHA-less legacy positive edited after its request boundary.
