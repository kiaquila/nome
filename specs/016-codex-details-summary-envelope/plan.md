# Plan

## Approach

Parse the two observed native summary envelopes into one closed internal shape:
the legacy Markdown heading and the current exact outer `details` wrapper. Keep
typed JSON validation, canonical table validation, timestamps, request binding,
finding history, and thread checks unchanged.

## Verification

- Add a regression using the observed nested details/footer presentation.
- Add adversarial wrapper, status, trailing-content, and finding cases.
- Run the Node review suite and `uv run python scripts/preflight.py`.
- Obtain native Codex review for the immutable head, verify every required
  check and thread, then keep the green state stable for 120 seconds.

## Risks

Loosely stripping HTML could hide findings or accept forged status text. The
parser therefore recognizes only the exact native wrapper and requires it to
close at the end of the comment.
