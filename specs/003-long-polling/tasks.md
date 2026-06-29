# Tasks: Telegram Bot Long Polling

- [x] Branch from `origin/main` as `codex/long-polling-and-license-removal`.
- [x] Delete `LICENSE` and confirm no remaining references in source or docs.
- [x] Add `get_updates` and `delete_webhook` to `TelegramBotAPI`; widen HTTP
      read timeout so long-poll calls do not abort.
- [x] Add `src/nome/polling.py` with `run_polling_worker` covering startup
      webhook cleanup, offset tracking, handler errors, and Telegram errors.
- [x] Update `src/nome/app.py` to start the polling worker inside the FastAPI
      lifespan, drop the webhook route, and keep `/healthz`.
- [x] Update `src/nome/config.py` to remove the webhook secret setting and add
      validated `long_poll_timeout_seconds` and `polling_error_backoff_seconds`.
- [x] Refresh `.env.example`, README, AGENTS guidance, architecture and
      deployment docs.
- [x] Update existing tests to drop the webhook secret field and add
      `tests/test_long_polling.py` for the new worker and Telegram methods.
- [x] Run `uv run python scripts/preflight.py` and address any failure.
- [x] Open PR against `main`; iterate on Codex review until merge-ready.
