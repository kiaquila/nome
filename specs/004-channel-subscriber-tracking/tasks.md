# Tasks: Channel Subscriber Tracking

- [x] Branch from fresh `origin/main` as `codex/channel-subscriber-tracking`.
- [x] Capture the current configured-channel roster through the owner Telethon
      session into ignored local `data/`.
- [x] Promote the configured Nome bot to administrator in the channel.
- [x] Add subscriber tracking settings and `chat_member` polling.
- [x] Add roster/digest storage and domain event classification.
- [x] Add owner notifications, daily digest processing, and count reconciliation.
- [x] Add one-time roster import command.
- [x] Update docs and `.env.example`.
- [x] Add tests for tracking, digest, drift, and import behavior.
- [x] Run `uv run python scripts/preflight.py`.
- [x] Commit, push, open a ready PR, and trigger `@codex review`.
