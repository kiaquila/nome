# Feature: Telegram Business Away Reply

## Summary

Nome v1 runs as a private Telegram Business chat automation assistant. When the
owner does not answer selected personal chats for three minutes, Nome sends one
clear away reply on the owner's behalf and does not repeat that reply to the
same chat for twelve hours. Nome also stays silent when the owner has herself
messaged that chat within the last twelve hours, so it only auto-replies to
genuinely new conversations the owner has not already started.

## Goal

Ship a safe first version of Nome as a Telegram Business away-reply assistant
that works for the owner only, covers the selected private chats, and provides
enough status visibility to audit what it did.

## Scope

- Receive Telegram Bot API webhook updates for Business connections and
  Business messages.
- Accept owner commands only from the hard-coded allowlisted Telegram username
  `ks_aquila`.
- Track selected private Business chats without storing message text.
- Send one away reply per chat per twelve-hour cooldown window.
- Provide an owner-only status command that reports who wrote, who received an
  away reply, and which private chats are still inferred unread.
- Provide a Telethon setup command that grants `@nome_ai_bot` the minimal
  Business chat automation rights for `@chapppp` and `@AlexOxitocin`.
- Replace the inherited Node/pnpm runtime setup with Python project tooling.

## Non-Goals

- LLM-generated replies.
- Group chat automation.
- Public or multi-owner bot operation.
- Storing raw Telegram message text.
- Mutating Telegram profile, stories, gifts, usernames, or message deletion
  permissions.

## Acceptance Criteria

- AC-001: Unknown Telegram users are rejected or ignored by default; owner
  commands are accepted only when `from.username` is `ks_aquila`.
- AC-002: Business updates for a connection whose owner username is not
  `ks_aquila` are ignored.
- AC-003: For an inbound private Business message from another user, Nome
  schedules an away reply for three minutes later
  (`NOME_AUTO_REPLY_DELAY_SECONDS`, default 180).
- AC-004: If the owner sends a Business message in that chat before the due
  time, Nome cancels the pending away reply and marks the chat read.
- AC-005: Nome sends at most one away reply to the same Business chat within a
  twelve-hour window.
- AC-006: The away reply text identifies Nome as the owner's assistant and says
  the owner is busy and will reply later.
- AC-007: The status command lists recent inbound private chats, chats that
  received an away reply, and inferred unread private chats without exposing
  message text.
- AC-008: The Telethon setup command resolves `@nome_ai_bot`, `@chapppp`, and
  `@AlexOxitocin`, then calls Telegram's connected-business-bot API with only
  `reply` and `read_messages` rights.
- AC-009: Local preflight runs Python formatting, linting, type checking, tests,
  and repository baseline checks.
- AC-010: If the owner has sent a Business message in a chat within the
  owner-active window (`NOME_OWNER_ACTIVE_WINDOW_HOURS`, default 12), a later
  inbound message from that contact does not schedule an away reply, though the
  inbound is still recorded for the status report.

## Privacy Requirements

- Do not log or persist raw message text.
- Do not commit Telegram tokens, API credentials, session files, user IDs, chat
  IDs, webhook URLs, or production database contents.
- Prefer Telegram usernames only for user-facing status and setup logs.
- Keep outbound automation reversible by using minimal Telegram permissions and
  a cooldown.
