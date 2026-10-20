# Tasks and evidence

- [x] Refresh refs and isolate a worktree from origin/main.
- [x] Preserve strict receipt-only authority; rely on closed structured verdicts for modern evidence.
- [x] Test unseen closings, contrary prose and latest invalidation.
- [x] Update durable review contract.
- [x] `uv run python scripts/preflight.py` passed: 105 Python tests, 24 Node groups, Ruff, mypy, feature-memory, repository and context checks.
- [ ] Obtain native final-head review and confirm required GitHub checks.

## Decision and dead end
Arbitrary suffix acceptance via a word exclusion list cannot prove a closing harmless. Discarded that experimental approach before publication. Structured state provides authority; presentation is never an additional verdict.

## CI security follow-up

OSV found GHSA-6q48-6c7w-9gw2 in certifi 2026.6.17. Updated only certifi lock artifacts to the scanner-confirmed fixed version 2026.10.19; no unrelated dependency changes. Re-run full preflight and obtain fresh exact-head native review.
