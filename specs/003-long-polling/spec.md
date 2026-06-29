# Feature: Telegram Bot Long Polling

## Summary

Nome consumes Telegram Bot API updates over long polling instead of an inbound
webhook. The runtime keeps a single loopback `/healthz` endpoint for the
existing deploy verifier and stops requiring any inbound HTTP exposure or
webhook secret.

## Goal

Replace the webhook intake with a long-polling worker so Nome can run on a
host that has no public HTTP listener, while preserving the existing reply
scheduler, allowlist, cooldown, and operational checks.

## Scope

- Add a Telegram long-polling worker that calls `getUpdates` for `message`,
  `business_connection`, and `business_message` updates and feeds them into the
  existing `UpdateHandler`.
- Delete any pre-existing Telegram webhook subscription on startup so
  `getUpdates` does not race with a stale webhook.
- Drop the webhook intake route (`POST /telegram/webhook`) and the
  `TELEGRAM_WEBHOOK_SECRET_TOKEN` setting.
- Keep the FastAPI app for the loopback `/healthz` probe used by the existing
  deploy verifier.
- Remove the repository's MIT `LICENSE` file. The project is private and ships
  no licensing grant.

## Non-Goals

- Migrating away from FastAPI for `/healthz`.
- Horizontal scaling of `getUpdates` (single consumer remains a v1 constraint).
- Changing the reply scheduler, allowlist, cooldown, or storage shape.
- Adding new product capabilities, retry semantics, or LLM integration.

## Acceptance Criteria

- `uv run nome` starts the long-polling worker and the reply scheduler under
  the same lifespan; both are cancelled on shutdown.
- On startup the worker issues `deleteWebhook` and continues even if Telegram
  rejects the call.
- `getUpdates` failures (timeout, HTTP error, transport error) trigger a
  bounded backoff and the loop continues.
- A handler exception advances the acknowledged offset so a poisoned update
  cannot block the queue.
- `Settings.from_env` requires only `TELEGRAM_BOT_TOKEN`; the previous webhook
  secret variables are gone from `.env.example` and the configuration loader.
- The repository no longer contains a `LICENSE` file or any reference to one.
- `uv run python scripts/preflight.py` passes locally.
