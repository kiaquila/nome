# Plan

## Architecture

Use a small Python service around FastAPI:

- `nome.app` owns the webhook endpoint and background worker lifecycle.
- `nome.handlers` translates raw Telegram updates into application behavior.
- `nome.storage` owns SQLite persistence and avoids storing message text.
- `nome.telegram_api` wraps Telegram Bot API calls.
- `nome.business_setup` owns the Telethon MTProto setup command.

Telegram-specific payloads stay at the edge of the application. Core scheduling
decisions use plain values and persisted state so process restarts do not lose
pending away replies.

## Storage

SQLite is sufficient for v1 and keeps deployment small on one AWS host. The
schema tracks:

- Business connection metadata.
- Per-chat state, including inferred unread counts and cooldown timestamps.
- Pending away replies.
- Sent away-reply events for status reporting.

Message bodies are intentionally excluded.

## Telegram Business Behavior

When `business_connection` arrives, store only allowed owner connections. When
`business_message` arrives:

- Ignore non-private chats.
- Treat messages from the owner as manual replies and cancel pending work.
- Treat messages from others as inbound messages, update unread state, and
  schedule a pending reply unless the twelve-hour cooldown is still active.

A background worker polls due pending replies and sends them through
`sendMessage` with `business_connection_id`.

## Owner Command

`/status` and `/inbox` are owner-only aliases. The command returns a compact
Russian summary of:

- recent private chats that wrote;
- chats Nome answered on the owner's behalf;
- inferred unread private chats.

## Setup Command

`python -m nome.business_setup` uses an existing Telethon user session plus
Telegram API credentials from environment variables. It grants `@nome_ai_bot`
access only to selected users and only with read/reply rights.

## Validation

- Unit tests cover allowlist, scheduling, cancellation, cooldown, and status
  output.
- Repository checks enforce Python project files, complete feature memory, and
  secret hygiene.
- CI runs the same preflight command.

## Verification

- Run `uv run python scripts/preflight.py` locally.
- Confirm the compatibility guard scripts still pass while the current default
  branch uses inherited PR checks.
- After opening the PR, watch GitHub CI, PR Guard, OSV Scan, and AI Review.
