# Feature: Channel Subscriber Tracking

## Summary

Nome tracks subscriber changes for one owner-configured Telegram channel. It
keeps a local current roster, sends immediate owner-only notifications while the
channel is below the configured threshold, and switches to daily aggregate
statistics after that threshold is reached.

## Goal

Let the owner see who subscribed or unsubscribed from her channel going forward
without storing historical subscriber lists or message content.

## Scope

- Add `chat_member` to the long-polling allowed updates so Telegram can deliver
  channel membership changes while Nome is an administrator in the channel.
- Store the current known channel roster in SQLite with `user_id`, username,
  first name, last name, bot flag, and timestamps.
- Import a one-time Telethon subscriber snapshot from a local JSON file into the
  roster.
- Process future `chat_member` updates for the configured channel and detect
  join, leave, and profile metadata changes.
- Send immediate owner-only Telegram notifications while the active human roster
  is below the configured threshold.
- After the threshold is reached, store only aggregate pending counts and send a
  daily digest.
- Periodically reconcile the local roster row count against Telegram
  `getChatMemberCount` after the configured count offset and report drift
  without trying to invent missing identities.

## Non-Goals

- Exporting historical channel subscribers through the Bot API.
- Storing message text, exported chats, invite-link history, or a permanent
  event log.
- Managing channel invite links or join requests.
- Supporting multiple owners or a public bot distribution.

## Acceptance Criteria

- `chat_member` updates for unrelated chats are ignored.
- Join and leave updates for the configured channel update the current roster.
- Human users trigger notifications; bot users do not.
- A join that reaches the threshold sends a final immediate threshold message;
  later changes are aggregated for the daily digest.
- Daily digest sending resets only aggregate counters and does not require
  storing per-user historical events.
- Count reconciliation records the latest Telegram count and reports drift to
  the owner without naming unknown users.
- The one-time import command loads the local Telethon snapshot into SQLite
  without printing subscriber names.
- `uv run python scripts/preflight.py` passes locally.
