# Plan

## Design

Keep trusted default-branch checkout in both review workflows. Parse the two
observed native formats in the shared helper. Recognize markers in the rerun
workflow and router without treating a wakeup signal as positive evidence.
Use updated_at for mutable comments and a complete current SHA for structured
state. Allow only the official About Codex informational footer on receipts.

Extract the gate's actual REST/GraphQL evidence evaluation into an injectable
module. Preserve the request marker requirement, check all unresolved threads
with pagination, retain negative formal evidence across requests, and recheck
PR head after evidence reads. Resolve pull_request context from the event SHA.

Serialize command and evidence requeues in one repository concurrency group
with queue: max. This also covers fork completions without a PR number in their
payload and prevents a newer pending wakeup from evicting an earlier one.
GitHub documents the queue semantics at
https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency. Recover signals through workflow_run completion
events after active attempts finish, then requeue once if the attempt began
before the signal. Inspect only the newest
run and its attempt start time. Re-fetch PR head before requeueing. Recover omitted fork PR associations through
the commit-to-pulls API, requiring an unambiguous open PR with matching head
repository, branch, full SHA and base repository. The switch
helper requests the full head SHA; command policy rejects an obsolete explicit SHA.

## Verification

Use node:test for classifier, event filter/router, API evaluator, pagination,
runtime exit codes, exact-head context and rerun state transitions. Run these
through the required Python preflight as well as directly. Check GitHub rules,
native review author/SHA, check suites and review thread resolution before merge.

## Rollout constraint

The PR's AI Review deliberately still executes main's trusted scripts. First
try genuine native formal review evidence that the existing gate understands.
If native review supplies only the new receipt/summary and no trusted rollout
path exists, keep the reviewed PR open and report the exact failed gate. Do not
weaken checks, publish synthetic success, use admin merge or execute unreviewed
PR scripts with elevated credentials to bootstrap the change.
