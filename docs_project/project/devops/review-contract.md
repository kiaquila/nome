# Review Contract

Review should focus first on risks that matter for a private assistant:

- secrets or private data committed to git;
- missing Telegram user allowlist checks;
- ambiguous assistant actions;
- side effects without confirmation or audit trail;
- weak error handling around external services;
- missing verification for acceptance criteria.

AI review evidence is advisory until branch protection is configured to require
it. Human ownership remains the final merge gate.

## Modern receipt closings and authoritative state

Unknown receipt closing prose alone never establishes approval. Modern native reviews supply a separate authoritative structured `codex-review-state:v1` summary; its current-request exact-head completed code verdict with explicit false findings flags permits new friendly closings without a phrase-list update. Security state must be entirely null or same-head completed with both flags false. Exact schema/types, duplicate detection, trusted author, request freshness and latest invalidation remain mandatory. A newer pending, malformed or contrary structured state invalidates older success; a later or equal-time unknown receipt remains pending and requires a fresh authoritative summary. Existing P0-P2, timeline, head and unresolved-thread vetoes remain in force.

Structured code approval uses the mandatory unique matching-head Code Review row completion datetime for freshness and ordering. It must follow the active request and cannot exceed comment edit time (allowing GitHub second precision). A security-only edit never refreshes or reorders an older code verdict. Pending/invalid state uses edit time to invalidate prior success.

Positive static receipt/legacy evidence uses immutable `created_at` for request freshness and ordering. Editing positive text cannot renew an old approval or overtake later pending state. Invalidating evidence continues to use edit time.

Validated typed findings persist across repeated requests until a strictly newer canonical completion explicitly clears the affected review section. Security findings require a matching current-head security row with its own valid completion datetime after the finding; fresh code completion, absent security state, stale security time or formal approval alone cannot clear that section. Native findings and unresolved threads retain their vetoes.

Completed typed finding observations use the affected section's own valid canonical completion time for ordering as well as clearance. Unrelated summary edits cannot renew an old finding; absent, invalid or running section clocks use the observation edit time conservatively.

Historical canonical resolution is independent of later request markers: a repeated request cannot revive an already cleared finding. Current code approval still requires fresh evidence after the active request.

Historical resolution uses the affected section projected into the strict canonical parser, retaining all visible non-row prose. Unrelated section activity cannot block resolution; contradictory prose cannot clear findings. New-request approval remains separately request-bound. Final regression coverage includes historical full/partial resolution and contradictory clears.

Canonical finding clocks require the visible section commit to match the typed full head; mismatches fall back to observation time. Matching native P1 regression and mandatory preflight passed (105 Python, 43 Node tests).
