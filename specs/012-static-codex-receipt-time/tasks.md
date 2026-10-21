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

Native outer-marker follow-up: require the same full current-head payload binding for historical outer summaries as for direct state markers; old malformed/foreign summaries cannot permanently veto fresh evidence. Actual-evaluator regressions added. Mandatory preflight passed: 105 Python, 33 Node tests.

Final bounded native schema follow-up: historical persistence requires closed duplicate-free typed state with an actual current-head finding and exactly one state marker after the optional outer marker. Old malformed/duplicate envelopes do not permanently veto; latest malformed remains nonpassing. Independent reviewer cleared eight focused history/schema cases. Mandatory preflight passed: 105 Python, 35 Node tests.

Affected-section follow-up: replace permanent typed-finding veto with a validated per-section history latch. Clearing requires explicit current-head false flags and a canonical datetime for that same section, strictly newer than finding/request, with second ties blocked. Regression covers explicit security clear, absent security, old security datetime and missing datetime. Mandatory preflight passed: 105 Python, 36 Node tests.

Final clock correction: validated completed typed negatives use their affected section's canonical completion time consistently in candidate ordering and latches; missing/invalid/running observations retain edit-time fallback. Symmetric code/security tests prove newer machine-only completion clears an old finding despite later unrelated comment edits. Independent bounded reviewer cleared both. Mandatory preflight passed: 105 Python, 38 Node tests.

Actual native follow-up: clear affected security history independently of stale code freshness, retire cleared typed findings from verdict selection, and retain old code as neutral rather than affirmative proof. Running sections retain edit-time observation ordering. Historical canonical resolution survives later requests; approval freshness remains current-request-bound. Actual evaluator regressions and independent bounded review passed. Mandatory preflight: 105 Python, 40 Node tests.

Historical resolution uses the affected section projected into the strict canonical parser, retaining all visible non-row prose. Unrelated section activity cannot block resolution; contradictory prose cannot clear findings. New-request approval remains separately request-bound. Final regression coverage includes historical full/partial resolution and contradictory clears.

Final mandatory preflight passed: 105 Python and 42 Node tests. Bounded independent review cleared canonical partial-section projection and retained visible contradiction guards.

Canonical finding clocks require the visible section commit to match the typed full head; mismatches fall back to observation time. Matching native P1 regression and mandatory preflight passed (105 Python, 43 Node tests).

Completed typed negative observations use their own strict canonical section clock independently of classifier outcome. Historical extraction accepts multiline JSON and unrelated HTML comments while rejecting duplicate protocol markers/schema. Once a strictly newer section completion clears a finding, its old malformed rendering cannot retain a veto; running-section observations remain active. Final mandatory preflight passed: 105 Python, 46 Node tests; independent bounded review cleared.

Malformed completed companions retain a separate observation-time invalidation even after an old finding is resolved. Each companion row is checked against its own typed SHA; a matching foreign-head completed companion remains valid. Paired actual evaluator controls and mandatory preflight passed: 105 Python, 47 Node tests.

Typed negative ordering is bound to the active full head and preserves configured trusted actors. Finding-bearing foreign companions require their own canonical rows, while completed coherent foreign companions retain their own clocks. Four-space/tab-indented protocol markers are Markdown examples and supply no approval, finding, or resolution authority; one-to-three-space HTML marker formatting remains supported. Mandatory preflight passed: 105 Python, 49 Node tests.
