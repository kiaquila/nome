# Architecture

## Shape

Nome should use a handler-first architecture:

- Telegram update adapter receives raw updates and authenticates the user.
- Router maps commands or conversation state to small handlers.
- Handlers call application services with plain input objects.
- Application services use injected ports for storage, LLMs, reminders, calendar,
  mail, and outbound Telegram replies.
- Adapters own API clients, retries, serialization, and provider-specific errors.

## Boundaries

Telegram-specific types should not leak into core assistant logic. Core services
should be testable with fake ports and without network access.

## Data Safety

Logs should avoid raw message text and external payloads unless a spec explicitly
allows it for local debugging. Secrets belong in environment variables or a
secret manager, never in committed files.

## Likely Runtime

Nome v1 uses Python 3.12, the Telegram Bot API over `httpx` with long polling,
Telethon for one-time Business chat automation setup, and SQLite for private
single-host persistence. A small FastAPI app exposes only a loopback `/healthz`
endpoint that the deploy verifier polls; the bot itself does not need any
inbound HTTP exposure. The runtime is intended for one AWS host/process in v1;
horizontal scaling would require both the pending-reply scheduler and the
single-consumer `getUpdates` loop to be reworked.

## Business Chat Automation

Telegram Business update handling lives at the edge. A long-polling worker
calls `getUpdates` for `message`, `business_connection`, and `business_message`
update kinds, records allowed Business connections for the single owner, and
turns private `business_message` updates into scheduling decisions. Message
text is not stored. Owner-sent Business messages cancel pending away replies.

The polling worker deletes any previously configured Telegram webhook on
startup so `getUpdates` cannot race against a stale subscription, then keeps
the highest acknowledged `update_id` in memory and advances the offset whether
or not the handler raised — re-delivering a poisoned update would block every
later update behind it.

The Telethon setup command grants only `read_messages` and `reply` rights for
the selected private chats. It does not request profile, story, gift, username,
or message deletion rights.
