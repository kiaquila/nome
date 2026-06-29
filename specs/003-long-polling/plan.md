# Plan: Telegram Bot Long Polling

## Approach

Long polling replaces the webhook intake but reuses every layer below it. The
`UpdateHandler`, storage, and reply worker stay untouched. A new
`run_polling_worker` consumes Telegram updates and hands them to the existing
handler.

## Components

1. `src/nome/telegram_api.py`
   - Add `get_updates(offset, timeout_seconds, allowed_updates, limit)` that
     calls Telegram `getUpdates` and returns the parsed update list.
   - Add `delete_webhook(drop_pending_updates)` for startup cleanup.
   - Extend the HTTP read timeout so long-poll calls do not abort.
   - Keep existing `send_message` and `get_business_connection` semantics.

2. `src/nome/polling.py` (new)
   - On startup, call `delete_webhook(drop_pending_updates=False)` and log if
     it fails — Telegram still serves `getUpdates` even when the webhook drop
     fails on the network.
   - Run a forever loop that fetches updates with the configured timeout and
     `allowed_updates` set, advances the in-memory `update_id` offset, and
     dispatches each update to the handler.
   - Handler exceptions advance the offset (re-delivering a poisoned update
     would block every later update). Telegram failures and network errors
     trigger a bounded backoff before retrying.

3. `src/nome/app.py`
   - Replace the webhook route with the long-polling worker started inside the
     existing FastAPI lifespan.
   - Keep `/healthz` for the deploy verifier; bind to `127.0.0.1`.
   - Cancel polling and reply tasks together on shutdown.

4. `src/nome/config.py`
   - Drop `webhook_secret_token` and its env validation.
   - Add `long_poll_timeout_seconds` and `polling_error_backoff_seconds` with
     conservative defaults (`50` and `5.0`).
   - Reject negative values for both new settings.

5. Docs and configuration
   - Update `.env.example`, README, AGENTS hints, architecture, and deployment
     docs to describe the long-polling runtime.
   - Remove the MIT `LICENSE` file (Nome is a private bot, no grant intended).

6. Tests
   - `tests/test_long_polling.py` covers offset advancement, handler errors,
     Telegram errors, broken updates without `update_id`, the `deleteWebhook`
     call, and `get_updates` / `delete_webhook` HTTP payloads.
   - Existing tests are updated to drop the webhook secret field and to cover
     the new configuration validation paths.

## Verification

- `uv run python scripts/preflight.py` — ruff format/check, mypy, pytest,
  feature memory, repository baseline, context budget.
- Manual smoke check (out of scope for this PR): start `uv run nome` with a
  test bot token, send a message to `@nome_ai_bot`, confirm the auto-reply
  arrives after the configured delay.

## Risks

- Telegram terminates `getUpdates` with `Conflict` when more than one consumer
  is active. The startup `deleteWebhook` mitigates the common case (a webhook
  still subscribed); a second running Nome process would still conflict.
- In-memory offset means duplicate delivery of the last batch after a restart.
  Telegram caps re-delivery at 24 hours and the handler is already idempotent
  on `inbound_message_id`, so this is acceptable for v1.

## Rollback

Revert the PR. The webhook adapter, route, and secret variables are removed,
so a true rollback restores the prior FastAPI webhook path.
