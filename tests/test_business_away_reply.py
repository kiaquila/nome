from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from nome.business_setup import _input_user_from_entity
from nome.config import ConfigurationError, Settings
from nome.handlers import UpdateHandler
from nome.storage import SQLiteStorage
from nome.telegram_api import TelegramAPIError, TelegramBotAPI


class FakeTelegram:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self.connections: dict[str, dict[str, Any]] = {}

    async def send_message(
        self,
        *,
        chat_id: int,
        text: str,
        business_connection_id: str | None = None,
    ) -> int:
        self.sent.append(
            {
                "chat_id": chat_id,
                "text": text,
                "business_connection_id": business_connection_id,
            }
        )
        return len(self.sent)

    async def get_business_connection(self, *, business_connection_id: str) -> dict[str, Any]:
        return self.connections[business_connection_id]


@pytest.fixture
def handler(tmp_path: Path) -> tuple[UpdateHandler, SQLiteStorage, FakeTelegram]:
    storage = SQLiteStorage(tmp_path / "nome.sqlite3")
    storage.initialize()
    telegram = FakeTelegram()
    settings = Settings(
        bot_token="test-token",
        database_path=tmp_path / "nome.sqlite3",
        auto_reply_delay_seconds=300,
        auto_reply_cooldown_hours=12,
    )
    return (
        UpdateHandler(settings=settings, storage=storage, telegram=telegram),  # type: ignore[arg-type]
        storage,
        telegram,
    )


@pytest.mark.asyncio
async def test_ignores_business_connections_for_unknown_owner(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, _telegram = handler

    await update_handler.handle_update(
        {
            "business_connection": {
                "id": "conn-1",
                "user": {"id": 100, "username": "someone_else"},
                "is_enabled": True,
                "rights": {"can_reply": True},
            }
        },
        now=1_000,
    )

    assert storage.get_business_connection("conn-1") is None


@pytest.mark.asyncio
async def test_accepts_legacy_top_level_can_reply_connection(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, _telegram = handler
    await update_handler.handle_update(
        {
            "business_connection": {
                "id": "conn-1",
                "user": {"id": 100, "username": "ks_aquila"},
                "user_chat_id": 900,
                "is_enabled": True,
                "can_reply": True,
            }
        },
        now=1_000,
    )
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)

    assert storage.due_replies(now=1_300)


@pytest.mark.asyncio
async def test_sends_one_away_reply_after_delay_then_respects_cooldown(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)

    assert await update_handler.process_due_replies(now=1_299) == 0
    assert await update_handler.process_due_replies(now=1_300) == 1
    assert telegram.sent == [
        {
            "chat_id": 200,
            "text": update_handler.settings.auto_reply_text,
            "business_connection_id": "conn-1",
        }
    ]

    await update_handler.handle_update(_inbound_update(message_id=12), now=1_400)
    assert storage.due_replies(now=2_000) == []
    assert await update_handler.process_due_replies(now=2_000) == 0


@pytest.mark.asyncio
async def test_ambiguous_send_failure_records_cooldown_without_retry(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)

    async def send_message_timeout(
        *,
        chat_id: int,
        text: str,
        business_connection_id: str | None = None,
    ) -> int:
        raise OSError("lost Telegram response")

    monkeypatch.setattr(telegram, "send_message", send_message_timeout)

    assert await update_handler.process_due_replies(now=1_300) == 1
    events = storage.recent_reply_events(since=0)
    assert len(events) == 1
    assert events[0].sent_message_id is None

    await update_handler.handle_update(_inbound_update(message_id=12), now=1_400)

    assert storage.due_replies(now=2_000) == []


@pytest.mark.asyncio
async def test_duplicate_inbound_update_does_not_increment_or_reschedule(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, _telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_100)

    unread = storage.unread_chats()
    assert len(unread) == 1
    assert unread[0].unread_count == 1
    due = storage.due_replies(now=1_300)
    assert len(due) == 1
    assert due[0].inbound_message_id == 11


@pytest.mark.asyncio
async def test_owner_reply_cancels_pending_away_reply(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, _storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)
    await update_handler.handle_update(_owner_business_reply(message_id=12), now=1_120)

    assert await update_handler.process_due_replies(now=1_400) == 0
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_older_inbound_after_owner_reply_does_not_schedule_reply(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(
        _owner_business_reply(message_id=12, date=1_120),
        now=2_000,
    )
    await update_handler.handle_update(
        _inbound_update(message_id=11, date=1_000),
        now=2_001,
    )

    assert storage.due_replies(now=2_500) == []
    assert await update_handler.process_due_replies(now=2_500) == 0
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_inbound_within_owner_active_window_does_not_schedule_reply(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    # The owner messaged the chat first; while that activity is recent Nome stays
    # silent even though the contact later writes back.
    await update_handler.handle_update(
        _owner_business_reply(message_id=12, date=1_120),
        now=1_120,
    )
    await update_handler.handle_update(
        _inbound_update(message_id=13, date=1_120),
        now=1_120,
    )

    assert storage.due_replies(now=100_000) == []
    assert await update_handler.process_due_replies(now=100_000) == 0
    assert telegram.sent == []
    # The contact's message is still tracked so it surfaces in the status report.
    assert storage.unread_chats()


@pytest.mark.asyncio
async def test_inbound_after_owner_active_window_schedules_reply(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, _telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(
        _owner_business_reply(message_id=12, date=1_120),
        now=1_120,
    )
    # Once the twelve-hour owner-active window has elapsed, a fresh inbound is
    # treated as a new conversation and an away reply is scheduled again.
    after_window = 1_120 + 12 * 60 * 60
    await update_handler.handle_update(
        _inbound_update(message_id=13, date=after_window),
        now=after_window,
    )

    assert storage.due_replies(now=after_window + 300)


@pytest.mark.asyncio
async def test_older_inbound_does_not_move_pending_reply_earlier(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, _telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(
        _inbound_update(message_id=20, date=1_300),
        now=2_000,
    )
    await update_handler.handle_update(
        _inbound_update(message_id=19, date=1_000),
        now=2_001,
    )

    assert storage.due_replies(now=1_599) == []
    due = storage.due_replies(now=1_600)
    assert len(due) == 1
    assert due[0].inbound_message_id == 20


@pytest.mark.asyncio
async def test_older_owner_reply_does_not_move_owner_timestamp_back(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, _telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(
        _owner_business_reply(message_id=30, date=1_200),
        now=2_000,
    )
    await update_handler.handle_update(
        _owner_business_reply(message_id=29, date=1_100),
        now=2_001,
    )
    await update_handler.handle_update(
        _inbound_update(message_id=31, date=1_150),
        now=2_002,
    )

    assert storage.due_replies(now=2_000) == []


@pytest.mark.asyncio
async def test_older_owner_reply_does_not_cancel_newer_pending_reply(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, _telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(
        _inbound_update(message_id=31, date=1_300),
        now=2_000,
    )
    await update_handler.handle_update(
        _owner_business_reply(message_id=30, date=1_200),
        now=2_001,
    )

    assert storage.due_replies(now=1_599) == []
    assert storage.due_replies(now=1_600)


@pytest.mark.asyncio
async def test_owner_reply_after_due_lookup_prevents_stale_away_reply(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)
    original_due_replies = storage.due_replies

    def due_replies_with_owner_reply(*, now: int, limit: int = 25) -> list[Any]:
        due = original_due_replies(now=now, limit=limit)
        storage.record_owner_reply(
            business_connection_id="conn-1",
            chat_id=200,
            chat_username="chapppp",
            chat_display="Private",
            now=now,
        )
        return due

    monkeypatch.setattr(storage, "due_replies", due_replies_with_owner_reply)

    assert await update_handler.process_due_replies(now=1_300) == 0
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_owner_reply_after_claim_prevents_away_reply_send(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)
    original_claim_due_reply = storage.claim_due_reply

    def claim_due_reply_with_owner_reply(
        *,
        pending: Any,
        now: int,
        lease_seconds: int = 300,
    ) -> Any:
        claimed = original_claim_due_reply(
            pending=pending,
            now=now,
            lease_seconds=lease_seconds,
        )
        assert claimed is not None
        storage.record_owner_reply(
            business_connection_id="conn-1",
            chat_id=200,
            chat_username="chapppp",
            chat_display="Private",
            now=now,
        )
        return claimed

    monkeypatch.setattr(storage, "claim_due_reply", claim_due_reply_with_owner_reply)

    assert await update_handler.process_due_replies(now=1_300) == 0
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_owner_reply_during_send_still_records_cooldown(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)

    async def send_message_with_owner_reply(
        *,
        chat_id: int,
        text: str,
        business_connection_id: str | None = None,
    ) -> int:
        storage.record_owner_reply(
            business_connection_id="conn-1",
            chat_id=200,
            chat_username="chapppp",
            chat_display="Private",
            now=1_300,
        )
        telegram.sent.append(
            {
                "chat_id": chat_id,
                "text": text,
                "business_connection_id": business_connection_id,
            }
        )
        return 99

    monkeypatch.setattr(telegram, "send_message", send_message_with_owner_reply)

    assert await update_handler.process_due_replies(now=1_300) == 1
    assert storage.recent_reply_events(since=0)

    await update_handler.handle_update(_inbound_update(message_id=12), now=1_400)

    assert storage.due_replies(now=2_000) == []


@pytest.mark.asyncio
async def test_business_echo_from_nome_does_not_cancel_pending_reply(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)
    await update_handler.handle_update(_bot_business_echo(message_id=12), now=1_100)

    assert storage.due_replies(now=1_300)
    assert await update_handler.process_due_replies(now=1_300) == 1
    assert telegram.sent


@pytest.mark.asyncio
async def test_ignores_business_messages_outside_selected_chat_allowlist(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(
        _inbound_update(message_id=11, username="unexpected"), now=1_000
    )

    assert storage.due_replies(now=1_400) == []
    assert await update_handler.process_due_replies(now=1_400) == 0
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_pending_reply_rechecks_chat_allowlist_before_sending(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)
    restricted_handler = UpdateHandler(
        settings=replace(update_handler.settings, setup_chat_usernames=("AlexOxitocin",)),
        storage=storage,
        telegram=telegram,  # type: ignore[arg-type]
    )

    assert await restricted_handler.process_due_replies(now=1_300) == 0
    assert storage.due_replies(now=1_300) == []
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_connection_losing_reply_rights_cancels_pending_away_reply(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)

    await update_handler.handle_update(
        _connection_update(can_reply=False),
        now=1_100,
    )

    assert storage.due_replies(now=1_400) == []
    assert await update_handler.process_due_replies(now=1_400) == 0
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_status_command_is_owner_only(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, _storage, telegram = handler
    await update_handler.handle_update(_connection_update(), now=1_000)
    await update_handler.handle_update(_inbound_update(message_id=11), now=1_000)

    await update_handler.handle_update(
        {
            "message": {
                "message_id": 1,
                "chat": {"id": 900, "type": "private"},
                "from": {"id": 100, "username": "ks_aquila"},
                "text": "/status",
            }
        },
        now=1_001,
    )

    assert telegram.sent
    report = telegram.sent[-1]["text"]
    assert "@chapppp" in report
    assert "Кто писал" in report
    assert "secret message" not in report


@pytest.mark.asyncio
async def test_status_command_does_not_reply_in_group_chat(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    update_handler, _storage, telegram = handler

    await update_handler.handle_update(
        {
            "message": {
                "message_id": 1,
                "chat": {"id": -900, "type": "group"},
                "from": {"id": 100, "username": "ks_aquila"},
                "text": "/status",
            }
        },
        now=1_001,
    )

    assert telegram.sent == []


@pytest.mark.asyncio
async def test_telegram_api_wraps_http_failures_as_retryable_errors() -> None:
    transport = httpx.MockTransport(lambda _request: httpx.Response(500, json={"ok": False}))
    async with httpx.AsyncClient(transport=transport) as client:
        telegram = TelegramBotAPI(bot_token="test-token", client=client)
        with pytest.raises(TelegramAPIError) as error:
            await telegram.send_message(chat_id=200, text="hello", business_connection_id="conn-1")
        assert error.value.ambiguous is True


def test_from_env_requires_bot_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)

    with pytest.raises(ConfigurationError):
        Settings.from_env()


def test_from_env_defaults_polling_settings(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token")
    monkeypatch.setenv("NOME_DATABASE_PATH", str(tmp_path / "nome.sqlite3"))
    monkeypatch.delenv("NOME_LONG_POLL_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("NOME_POLLING_ERROR_BACKOFF_SECONDS", raising=False)

    settings = Settings.from_env()

    assert settings.long_poll_timeout_seconds == 50
    assert settings.polling_error_backoff_seconds == 5.0


def test_from_env_defaults_reply_timing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token")
    monkeypatch.setenv("NOME_DATABASE_PATH", str(tmp_path / "nome.sqlite3"))
    monkeypatch.delenv("NOME_AUTO_REPLY_DELAY_SECONDS", raising=False)
    monkeypatch.delenv("NOME_OWNER_ACTIVE_WINDOW_HOURS", raising=False)

    settings = Settings.from_env()

    assert settings.auto_reply_delay_seconds == 180
    assert settings.owner_active_window_hours == 12
    assert settings.owner_active_window_seconds == 43_200


def test_from_env_rejects_negative_long_poll_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token")
    monkeypatch.setenv("NOME_LONG_POLL_TIMEOUT_SECONDS", "-1")

    with pytest.raises(ConfigurationError):
        Settings.from_env()


def test_from_env_rejects_negative_polling_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token")
    monkeypatch.setenv("NOME_POLLING_ERROR_BACKOFF_SECONDS", "-0.5")

    with pytest.raises(ConfigurationError):
        Settings.from_env()


def test_business_setup_builds_input_user_from_entity() -> None:
    input_user = _input_user_from_entity(SimpleNamespace(id=123, access_hash=456))

    assert input_user.user_id == 123
    assert input_user.access_hash == 456


def test_claimed_reply_stays_durable_until_lease_expires(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    _update_handler, storage, _telegram = handler
    storage.record_inbound(
        business_connection_id="conn-1",
        chat_id=200,
        chat_username="chapppp",
        chat_display="Private",
        inbound_message_id=11,
        now=1_000,
        delay_seconds=300,
        cooldown_seconds=43_200,
    )
    pending = storage.due_replies(now=1_300)[0]

    claimed = storage.claim_due_reply(pending=pending, now=1_300, lease_seconds=60)

    assert claimed is not None
    assert claimed.claim_token is not None
    assert storage.due_replies(now=1_359) == []
    assert storage.due_replies(now=1_361)


def test_active_claim_is_not_overwritten_by_new_inbound(
    handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    _update_handler, storage, _telegram = handler
    storage.record_inbound(
        business_connection_id="conn-1",
        chat_id=200,
        chat_username="chapppp",
        chat_display="Private",
        inbound_message_id=11,
        now=1_000,
        delay_seconds=300,
        cooldown_seconds=43_200,
    )
    pending = storage.due_replies(now=1_300)[0]
    claimed = storage.claim_due_reply(pending=pending, now=1_300, lease_seconds=60)
    assert claimed is not None

    result = storage.record_inbound(
        business_connection_id="conn-1",
        chat_id=200,
        chat_username="chapppp",
        chat_display="Private",
        inbound_message_id=12,
        now=1_310,
        delay_seconds=300,
        cooldown_seconds=43_200,
    )

    assert not result.scheduled
    assert storage.mark_reply_sent(pending=claimed, sent_message_id=1, now=1_320)
    assert storage.due_replies(now=2_000) == []
    assert storage.recent_reply_events(since=0)[0].inbound_message_id == 11


def _connection_update(*, can_reply: bool = True) -> dict[str, Any]:
    return {
        "business_connection": {
            "id": "conn-1",
            "user": {"id": 100, "username": "ks_aquila"},
            "user_chat_id": 900,
            "is_enabled": True,
            "rights": {"can_reply": can_reply},
        }
    }


def _inbound_update(
    *, message_id: int, username: str = "chapppp", date: int | None = None
) -> dict[str, Any]:
    return {
        "business_message": {
            "message_id": message_id,
            "business_connection_id": "conn-1",
            "chat": {
                "id": 200,
                "type": "private",
                "username": username,
                "first_name": "Private",
            },
            "from": {"id": 200, "username": username},
            "text": "secret message",
            **({"date": date} if date is not None else {}),
        }
    }


def _owner_business_reply(*, message_id: int, date: int | None = None) -> dict[str, Any]:
    return {
        "business_message": {
            "message_id": message_id,
            "business_connection_id": "conn-1",
            "chat": {
                "id": 200,
                "type": "private",
                "username": "chapppp",
                "first_name": "Private",
            },
            "from": {"id": 100, "username": "ks_aquila"},
            "text": "manual reply",
            **({"date": date} if date is not None else {}),
        }
    }


def _bot_business_echo(*, message_id: int) -> dict[str, Any]:
    update = _owner_business_reply(message_id=message_id)
    update["business_message"]["sender_business_bot"] = {"id": 500, "username": "nome_ai_bot"}
    return update
