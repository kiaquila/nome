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

Protocol-prefix detection is case-insensitive before unrelated HTML comment normalization: case-varied unknown Codex markers stay malformed and cannot clear historical findings. Final mandatory preflight passed: 105 Python, 50 Node tests.

Official marker discovery is case-insensitive. Indented protocol examples in later finding presentation do not erase genuine leading evidence. Partial resolution validates any visible counterpart row before removing it, including inactive-section warnings; canonical Running rows remain supported. Mandatory preflight passed: 105 Python, 51 Node tests; independent bounded A/B/C review cleared.

Native BOM follow-up: normalize U+FEFF before examining leading protocol indentation, so BOM-prefixed Markdown examples cannot approve, create findings, or clear history. Actual evaluator regressions cover four spaces and tabs; mandatory preflight passed (105 Python, 51 Node tests).

Companion projection requires exact canonical first-cell review labels; warning text cannot be erased with an otherwise canonical Running row. BOM-prefixed indented envelopes remain Markdown examples. Actual evaluator/gate paired controls pass; mandatory preflight validation recorded on the final head.

Native negative-presentation follow-up: genuine leading typed findings survive trailing quoted/fenced examples and bare markers. Duplicate markers within the leading envelope and whole quoted/fenced envelopes remain non-authoritative. Approval and clearing still require the original full body. Actual gate/evaluator paired regressions and independent bounded review passed.

Actual native own-clock follow-up: warning-bearing row labels, unsupported triggers and contrary finding prose cannot borrow an old completion time; canonical own-section presentation is required, independently of companion state. Metadata-prefixed malformed protocol observations remain pending (Nome discovery normalized; HA already protected). Fenced-only clean counterparts cannot resolve findings. Bounded actual-path regressions pass.

Consolidated actual-native corrections passed mandatory preflight: 105 Python, 54 Node tests. Independent bounded reviewer cleared own-row warning/prose clocks, metadata discovery and fenced-clear controls.

16:18 actual native counterparts: canonical newer structured completion clears post-request typed finding prose, while raw prose/equal-clock findings stay blocked. Code-indented headings supply no approval; formatted warning triggers cannot approve. Mixed-length fenced security counterparts remain rejected by the unchanged full-body parser.

16:18 bounded corrections passed mandatory preflight: 105 Python, 56 Node tests; independent reviewer cleared exact recovery/heading/trigger controls.

16:25 actual rendered-warning counterpart: strict trigger fields already reject encoded warnings, while permitted footer warnings needed visible numeric-entity/inline-format normalization. Exact P&#49;, P*1* and Do&#32;not&#32;merge approval/history-clear regressions pass; typed negative authority unchanged.

16:25 rendered-warning corrections passed mandatory preflight: 105 Python, 57 Node tests; independent bounded reviewer cleared exact footer approval and history-clear cases.

16:38/16:41 actual counterparts: reject code-indented summary headings after BOM or same-line presentation metadata; normalize MediumSpace/hairsp in existing visible warning checks. Hidden or multiline-comment-split completion rows remain unable to approve or clear findings; focused production-path controls cover both.

16:38/16:41 corrections passed mandatory preflight: 105 Python and 57 Node tests; independent bounded review cleared exact controls.

16:46 actual native counterparts: rendered link-label/inline-HTML/Cf warnings in permitted informational footers remain blocking. Completion rows inside collapsed informational details cannot grant approval or clear history (HA corrected visible-row collection; Nome already rejected). Exact production-path controls cover approval and clearance.

16:46 consolidated corrections passed mandatory preflight: 105 Python and 57 Node tests; independent bounded reviewer cleared rendered-footer and collapsed-row controls.

16:51 actual counterparts: use the standard HTML5 whitespace/format entity map without dependencies; zero-width word separators cannot conceal the existing Do not merge warning. Exact ThinSpace/ZeroWidthSpace/numeric-zero-width controls pass. Indent-then-BOM protocol marker remains rejected by the existing raw envelope guard.

16:51 consolidated corrections passed mandatory preflight: 105 Python and 57 Node tests; exact native counterpart regressions pass.

16:59 actual variation-selector warning: visible contradiction checks normalize Unicode Default_Ignorable_Code_Point rather than only Cf, so P plus U+FE0F plus 1 cannot approve or clear history. Raw machine evidence parsing is unchanged; exact footer production-path regression added.

16:59 variation-selector correction passed mandatory preflight: 105 Python and 57 Node tests.

17:03 actual native counterparts: visible checks project inline HTML generally and preserve block boundaries, preventing sub/kbd or comment-split warnings from becoming clean while adjacent About-summary severity remains blocking. Encoded inactive companion labels and balanced-link warning triggers are already rejected by strict row grammar; exact production controls retain those boundaries.

17:08 current-batch counterparts: complementary joined/separated inline-text projections preserve P<span></span>1 severity and Do<span>not</span>merge warnings. Raw indentation guard accounts for JS-trim-consumed Unicode whitespace, including NBSP between indentation and protocol marker; Markdown examples cannot acquire authority. No finding-count grammar added where none existed.

17:03/17:08 consolidated source passed mandatory preflight (105 Python, 57 Node). Final JS/tests edit 17:11:06 UTC; explicit Node proof started 17:14:00 UTC and exited 0 at 17:14:15 UTC. Independent bounded reviewer cleared exact current-batch controls. Publication waits for the shared batch barrier.

17:23 actual native findings: warning presentation projection consumes quoted HTML attributes and balanced Markdown link destinations fully. Exact permitted-footer Do <span title=">">not</span> merge and Do [not](https://example.com/(x)) merge remain blocking for approval and typed-history clearance; raw machine grammar unchanged.

- [x] Preserve exact native-reported image-alt, reference-link and malformed-link warnings; reject optional-pipe and quoted encoded companion rows as ambiguous clock/presentation evidence, with strict original-body hidden-row controls.

- [x] Cover actual collapsed/shortcut reference links, optional titles, raw comment/HTML/entity ordering, malformed link literals, visible details summary ambiguity and existing footer state contradictions with negative-only projections.

- [x] Preserve warning labels in valid whitespace/empty-destination links while escaped openers and malformed destinations remain literal; verify raw HTML containers and unmatched closing tags cannot lend completion clocks or clear findings.

- [x] Retain visible priorities in code-rendered literal link syntax; cover native code span, fenced block and raw code footer regressions.

- [x] Preserve actual nested-link precedence and literal Markdown code warnings before HTML/link/entity projection; cover rendered-equivalent duplicate Security rows without granting authority.

- [x] Reject unmatched footer closures swallowing visible failed rows; preserve quoted code warnings and existing singular article finding statements with exact native regressions.

- [x] Share validated inline/reference destination grammar for multiline definitions and preserve literal code under quote/list containers.

- [x] Correct actual escaped-backtick false blocks and cover existing rendered article-finding/raw comment-pipe delimiter protections.

- [x] Omit valid nonrendered reference definitions without hiding malformed/literal text; retain worded finding-count contradictions and strict opaque raw-HTML row protections.

- [x] Preserve literal severity in invalid blank-line link labels while accepting valid soft-line-break labels.

- [x] Reject invalid reference-definition labels before suppressing literal visible findings (native 4341183311).

- [x] Preserve raw-HTML-block Markdown literals without exposing hidden HTML attributes; retain rendered benign finding negation and malformed-reference destination controls.

- [x] Route optional-semicolon numeric decoding by verified HTML-block context; preserve Markdown/code literals and soft-break finding evidence.

- [x] Preserve raw HTML warnings inside quote/list containers and mixed zero/positive finding clauses; retain renderer-verified script/style visible evidence.

- [x] Cover actual footnotes, destination nesting limits, contextual malformed closing tags, blank-separated collapsed completion rows and existential finding statements.

- [x] Cover actual affirmative numeric count contradictions independently of reporting verbs, preserving zero/no-only controls.

- [x] Cover actual malformed inline tags, transitive/case-folded footnotes with used/unused lazy continuations, ordinary-reference fallback, and raw HTML container exits.

- [x] Cover actual unused footnotes mentioned only in link destinations, with official-renderer hidden-attribute and visible-label controls.

- [x] Keep quote/list raw HTML continuation indentation in the same peeled coordinate system, including combined containers.

- [x] Cover actual list-before-quote raw HTML continuation using an ordered container stack.

- [x] Cover official nested-angle-link rendering and actual indefinite finding statements, retaining normal-reference footnote and paragraph-boundary controls.

- [x] Cover actual Unicode full-case-fold footnote matching with the shared generated primitive and exact SS/ß regression.

- [x] Cover actual late bug finding edit versus intermediate clean evidence, strictly newer canonical recovery, and no/zero/paragraph controls.

- [x] Cover actual tab-expanded container indentation, abrupt comment closers, raw legacy named spacing references, and negated finding clearance.
