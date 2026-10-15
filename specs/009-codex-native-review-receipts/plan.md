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
GitHub added larger queues on [2026-05-07](https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/).
The current [job concurrency syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idconcurrency)
supports up to 100 pending jobs with queue: max and cancel-in-progress: false.
GitHub accepted this PR's configuration in
[AI Review Rerun run 38817982655](https://github.com/kiaquila/nome/actions/runs/38817982655).
Recover signals through workflow_run completion events after active attempts
finish, then requeue once if the attempt began before the signal. Inspect only
the newest run and its attempt start time. Re-fetch PR head before requeueing.
Recover omitted fork PR associations through
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
