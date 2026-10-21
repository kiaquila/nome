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

Completed typed negative observations use their own strict canonical section clock independently of the other section. The own row must have its canonical label, status, commit and trigger, and its projected full presentation must remain canonical before its completion clock is authoritative; warning text or contrary prose falls back to observation time. Historical negative facts come from the strict canonical leading envelope through the summary heading, with closed schema, duplicate-key detection and unique protocol markers inside that envelope. Later finding presentation, including quoted or fenced examples and trailing markers, cannot erase explicit true finding flags. Whole-body approval and historical clearing remain strict; examples and duplicate markers inside the leading envelope supply no authority. Existing multiline JSON and unrelated HTML comment compatibility remains supported. Once a strictly newer section completion clears a finding, its old malformed rendering cannot retain a veto; running-section observations remain active. Final mandatory preflight passed: 105 Python, 46 Node tests; independent bounded review cleared.

Malformed completed companions retain a separate observation-time invalidation even after an old finding is resolved. Each companion row is checked against its own typed SHA; a matching foreign-head completed companion remains valid. Paired actual evaluator controls and mandatory preflight passed: 105 Python, 47 Node tests.

Typed negative ordering is bound to the active full head and preserves configured trusted actors. Finding-bearing foreign companions require their own canonical rows, while completed coherent foreign companions retain their own clocks. Four-space/tab-indented protocol markers are Markdown examples and supply no approval, finding, or resolution authority; one-to-three-space HTML marker formatting remains supported. Mandatory preflight passed: 105 Python, 49 Node tests.

Protocol-prefix detection is case-insensitive before unrelated HTML comment normalization: case-varied unknown Codex markers stay malformed and cannot clear historical findings. Final mandatory preflight passed: 105 Python, 50 Node tests.

A strictly newer canonical same-section completion retires ordinary prose belonging to the resolved typed finding; raw negative prose and native unresolved findings retain their veto. Four-space/tab-indented summary headings are code examples, and visible review triggers must match the canonical request labels.

Visible P0–P2 and explicit “Do not merge” warnings remain blocking inside permitted informational footers. Their visible-text check decodes numeric HTML entities, standard HTML5 whitespace/format entities and balanced and defined-reference Markdown links (explicit, collapsed and shortcut forms)/emphasis (malformed destinations retain literal warning text), quote-aware inline HTML including image alt text (with block boundaries preserved) and Unicode default-ignorable characters; protocol markers, structured schema, commit identity and timestamps keep their original strict parsing. These warnings cannot establish approval or a structured finding clear.

Rendered review rows with a missing leading pipe or quoted/encoded labels invalidate ambiguous section clocks and inactive companion presentation. Such rows never establish completion authority; canonical original rows and strict full-body approval/clearing remain required.

Negative-only visible text removes raw comments while preserving line boundaries, tokenizes raw HTML attribute quoting, projects valid Markdown destinations and optional standard titles, then decodes character references. Decoded characters cannot manufacture HTML or Markdown structure; undefined reference labels remain literal counterevidence, and visible details summary rows remain ambiguous rather than gaining completion authority.

Existing explicit finding, failed/pending review and changes-requested footer contradictions cannot approve or clear findings. Case-varied rendered review labels participate only in ambiguity detection; canonical original labels remain required for authoritative clocks.

Link-label projection preserves code-rendered literal text in Markdown code spans/fences and raw code elements, so visible priority warnings inside literal link syntax remain counterevidence. This presentation handling grants no machine or completion-clock authority.

Nested active links retain precedence over an invalid enclosing link in visible warning checks; the enclosing destination remains literal counterevidence. Balanced plain labels remain supported.

Markdown literal code is isolated before HTML, links and entity projection; indented code, spans and fences retain their visible literal warning text. Rendered-equivalent duplicate review labels remain ambiguity only and never supply a clock.

Informational footer removal requires a single balanced details element; content after its matching close remains subject to the original strict grammar. Blockquote-contained code fences remain literal in warning projection, and the existing finding category includes singular article wording.

Defined reference links support a destination on the following line using the same destination/title validation as inline links. Quote and list container prefixes are recognized before literal code classification.

Escaped opening backticks remain literal punctuation around real links; only an unescaped opener establishes a code span, whose backslashes remain literal. Original table delimiters remain strict even inside HTML comments, and rendered finding statements retain observation-time vetoes.

Validated reference-definition blocks, including consumed destination/title lines, are omitted from visible warning text; malformed definitions and code-rendered definitions stay literal. Existing positive finding counts remain contradictory to clean proof.

Markdown link labels containing a blank line remain literal visible text; a valid soft line break does not change destination visibility. This projection does not change protocol authority.

Reference-definition labels must satisfy the standard nonempty label grammar and length bound before definitions become nonrendered; unescaped brackets remain literal warning text.

Visible contradiction projection preserves the standard raw HTML block distinction: HTML still renders, while Markdown syntax in the block remains literal until its standard terminator. About Codex has no special exception. Rendered no/zero/0 finding negation remains benign, and invalid reference destinations remain literal.

Optional-semicolon numeric character references are interpreted only in raw HTML block text, matching GitHub rendering; ordinary Markdown (including inline HTML) requires the semicolon, and literal Markdown code is never decoded. Finding statements normalize soft breaks while retaining paragraph boundaries.

Raw HTML context detection peels the existing Markdown quote/list container prefixes. Finding-statement negation applies per finding clause: a zero count in one section cannot hide a positive finding in another. GitHub tagfilter preserves visible script/style text as escaped markup; it must not be discarded.

Referenced footnote contents remain visible evidence; unused definitions are omitted only in Markdown contexts, with code and raw HTML contexts kept distinct. ordinary link destinations are suppressed only within GitHub’s balanced nesting limit. Malformed closing tags remain literal in Markdown but use HTML parsing inside raw blocks. Collapsed details remain non-authoritative across blank lines, independently of Markdown block termination. Existential issue statements retain the existing finding veto.

Positive numeric counts attached to issue, finding, or problem nouns remain contrary evidence independently of the reporting verb; zero/no-only statements retain their clean meaning.

Inline HTML is removed only after its complete GFM tag grammar validates; malformed visible tags retain warnings. Footnote evidence follows case-insensitive references transitively, retaining used lazy continuations and omitting unused definitions; invalid footnote identifiers use ordinary reference parsing. Raw HTML parsing ends when its Markdown quote/list container ends.

Footnote use graphs follow rendered inline labels and contents, including transitive references; hidden link destinations and HTML attributes cannot activate otherwise unused footnotes.

Raw HTML continuation follows the ordered Markdown container stack, preserving both quote-before-list and list-before-quote nesting.

Official GitHub rendering retains the outer destination for an angle autolink inside a Markdown link label; it does not expose that destination as warning text. Indefinite finding statements remain contrary evidence independently of reporting verbs within a paragraph; separate paragraphs do not form one statement.

Footnote identifiers use Unicode 16.0 full case folding, with a shared generated exception table and per-code-point lowercase fallback; protocol bytes and canonical state fields are unchanged.

The shared affirmative finding noun category includes bugs consistently for article, count, and existential statements. A late visible bug statement renews negative observation time; only a strictly newer canonical section clearance resolves it. No/zero statements and paragraph boundaries retain their existing semantics.

Container indentation uses four-column tab stops. Abrupt HTML comment closers preserve subsequent visible text; raw HTML legacy spacing references follow HTML rules without changing Markdown entity parsing. Explicitly negated finding statements remain clean evidence rather than affirmative findings.
