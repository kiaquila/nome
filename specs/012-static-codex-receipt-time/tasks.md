# Tasks

- [x] Isolate follow-up work from origin/main after PR41 merged.
- [x] Bind positive static receipt freshness/order to creation time.
- [x] Add helper and actual-gate regressions.
- [x] Run mandatory preflight (105 Python tests, 27 Node tests).
- [ ] Obtain final-head native review.

## Process memory
Independent parser review found that updated_at allowed an edited old positive receipt to overtake a later pending machine state. Positive edits cannot renew evidence; negative edits still invalidate.

Cross-repository native-review regression confirmed historical prose failures incorrectly persisted across requests in the actual gate. Scope prose failures to current request while preserving typed/native finding vetoes. Tests cover old failure and stale edited approval followed by fresh clean proof. Required preflight passed: 105 Python and 28 Node tests.

Native P1 normalization follow-up: structured typed-finding veto uses the classifier's trimmed-body convention, including BOM and leading whitespace. Actual-gate regressions cover both. Mandatory preflight passed: 105 Python, 29 Node tests.

Native direct-marker follow-up: preserve failures for both normalized structured prefixes recognized by the classifier, including direct state markers. Actual-gate regression covers bare, whitespace and BOM forms. Mandatory preflight passed: 105 Python, 30 Node tests.

Native head-lifecycle follow-up: historical direct-state veto requires matching full current code/security SHA. A strictly later exact-head formal approval may supersede older pending prose; same-second signals remain pending, and typed/native failures still veto. Actual-evaluator regressions cover foreign direct state and formal ordering. Mandatory preflight passed: 105 Python, 32 Node tests.
