# Tasks

- [x] Reproduce the live gate failure against current GitHub evidence.
- [x] Identify the native presentation change.
- [x] Add closed-envelope parsing with status agreement.
- [x] Add positive and adversarial regression coverage.
- [x] Update the durable review contract.
- [x] Run the repository preflight.
- [ ] Obtain current-head native review and merge with all gates green.

## Process Memory

### Decisions

Treat the outer details block as presentation only after exact structural
validation; keep the typed state and canonical table as the verdict authority.
Historical single-section clearance normalizes only the internal projected
wrapper to Completed; the original whole-comment wrapper remains strictly
validated against its typed status.

### Dead Ends

Rerunning the existing gate cannot help because it deterministically classifies
the new native envelope as a failure.

### Known Issues

The fix requires the documented immutable gate snapshot bootstrap because the
default-branch parser is the component being repaired.
