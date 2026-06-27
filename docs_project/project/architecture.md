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

Nome v1 uses Python 3.12, FastAPI, Telegram Bot API over `httpx`, Telethon for
one-time Business chat automation setup, and SQLite for private single-host
persistence. The runtime is intended for one AWS host/process in v1; if the bot
is later scaled horizontally, pending reply scheduling should move to a shared
queue or database lease.

## Business Chat Automation

Telegram Business update handling lives at the edge. The webhook receives raw
Bot API updates, records allowed Business connections for the single owner, and
turns private `business_message` updates into scheduling decisions. Message text
is not stored. Owner-sent Business messages cancel pending away replies.

The Telethon setup command grants only `read_messages` and `reply` rights for
the selected private chats. It does not request profile, story, gift, username,
or message deletion rights.
