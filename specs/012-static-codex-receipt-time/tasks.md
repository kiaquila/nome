# Tasks

- [x] Isolate follow-up work from origin/main after PR41 merged.
- [x] Bind positive static receipt freshness/order to creation time.
- [x] Add helper and actual-gate regressions.
- [x] Run mandatory preflight (105 Python tests, 27 Node tests).
- [ ] Obtain final-head native review.

## Process memory
Independent parser review found that updated_at allowed an edited old positive receipt to overtake a later pending machine state. Positive edits cannot renew evidence; negative edits still invalidate.
