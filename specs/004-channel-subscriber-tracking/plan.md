# Plan: Channel Subscriber Tracking

## Approach

Nome already has a single long-polling update path and a small scheduled worker.
Subscriber tracking should reuse both: the update handler receives
`chat_member` updates, delegates the membership decision to a small domain
module, and persists only the current roster plus digest aggregates. The worker
performs lightweight count reconciliation and daily digest delivery.

## Components

1. `src/nome/config.py`
   - Add optional owner chat id, tracked channel username/id, threshold, digest
     interval, and count-check interval settings.
   - Keep tracking disabled until a channel is configured.

2. `src/nome/channel_subscribers.py`
   - Parse Telegram `ChatMemberUpdated` payloads into joined, left, profile
     updated, or ignored outcomes.
   - Format private owner notifications and aggregate digest text.

3. `src/nome/storage.py`
   - Add `channel_members` for the current roster only.
   - Add `channel_tracking_state` for aggregate counts, last digest/check
     timestamps, latest Telegram count, and threshold transition state.
   - Add focused methods for roster import, event recording, digest claiming,
     and drift recording.

4. `src/nome/handlers.py`
   - Route `chat_member` updates through the subscriber tracker.
   - Send owner notifications only when `NOME_OWNER_CHAT_ID` is configured.
   - Keep unknown identities out of logs.

5. `src/nome/worker.py`
   - Run due daily channel digests and count reconciliation alongside the
     existing away-reply scheduler.

6. `src/nome/telegram_api.py`
   - Add `get_chat_member_count`.

7. `src/nome/channel_roster_import.py`
   - Load the local Telethon JSON snapshot into SQLite and report only counts.

8. Tests and docs
   - Add unit tests for event classification, storage updates, notifications,
     digest rollover, count drift, and snapshot import.
   - Update product docs, README, and `.env.example`.

## Verification

- `uv run python scripts/preflight.py`
- Manual setup already performed locally:
  - Telethon snapshot captured to ignored `data/vibecode-schrodinger-roster.json`.
  - `@nome_ai_bot` promoted to administrator in `@vibecodesh`.

## Risks

- Telegram Bot API cannot enumerate all channel subscribers. The initial roster
  must come from the owner-authorized Telethon session, and future exact
  identity tracking depends on Nome continuously receiving `chat_member`
  updates.
- If Nome is offline long enough for Telegram to drop updates, count
  reconciliation can detect drift but cannot recover the missing identities.

## Rollback

Disable channel tracking by unsetting the channel configuration and revert this
PR. The roster tables are additive and do not affect the Business away-reply
workflow.
