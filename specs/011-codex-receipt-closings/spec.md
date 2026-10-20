# Authoritative Codex review verdicts

## Goal
Accept modern clean structured Codex review evidence regardless of friendly receipt closing wording, while refusing unknown receipt-only prose as authority.

## Scope
Review evidence parsing and tests; runtime bot behavior is unchanged.

## Acceptance Criteria
- Unseen encouragement does not require expanding a phrase whitelist: the current-request exact-head structured verdict provides authority.
- A receipt with unknown prose alone cannot pass. Later pending, malformed or contrary evidence invalidates older clean evidence.
- Structured v1 uses exact keys/types, no duplicates, full current SHA and completed false/false code flags. Security is all null or same-head completed false/false.
- Preserve trusted identities, request time, timeline, P0-P2 and unresolved-thread vetoes.
- Run preflight and obtain native full-head review before merge.

## Negative scenarios
Unknown receipt wording alone, arbitrary contradictory prose, stale SHA/request, spoofed identity, duplicate/unknown markers, pending/security findings or contradictory visible text cannot pass.

Structured code approval uses the mandatory unique matching-head Code Review row completion datetime for freshness and ordering. It must follow the active request and cannot exceed comment edit time (allowing GitHub second precision). A security-only edit never refreshes or reorders an older code verdict. Pending/invalid state uses edit time to invalidate prior success.
