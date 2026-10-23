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

- Negative presentation recognizes raw HTML blocks after code without allowing them to interrupt a paragraph.
- Only an explicitly finding-bearing typed companion may isolate its warning trigger from the other channel’s completion clock; contradictory clean companions remain observation-time invalidators.


## Closed native completion contract

Only canonical native heading/table/schema and the exact observed informational help footer can establish completion clocks or clear a channel. Arbitrary prose or Markdown, including apparently harmless examples and negated findings, remains observation-time evidence. A strictly newer canonical own-channel clear can recover typed findings; independent raw warnings retain their existing veto. Static replies require one whole recognized no-findings verdict, a finite observed closing, and existing SHA/request checks. Completed null/null lifecycle is never approval and may coexist only with a fresh immutable current-SHA receipt within its own completion window.
