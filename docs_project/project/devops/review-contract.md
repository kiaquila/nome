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
