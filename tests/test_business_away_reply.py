from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from nome.config import Settings
from nome.handlers import UpdateHandler
from nome.storage import SQLiteStorage


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
        webhook_secret_token=None,
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


def _connection_update() -> dict[str, Any]:
    return {
        "business_connection": {
            "id": "conn-1",
            "user": {"id": 100, "username": "ks_aquila"},
            "user_chat_id": 900,
            "is_enabled": True,
            "rights": {"can_reply": True},
        }
    }


def _inbound_update(*, message_id: int) -> dict[str, Any]:
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
            "from": {"id": 200, "username": "chapppp"},
            "text": "secret message",
        }
    }


def _owner_business_reply(*, message_id: int) -> dict[str, Any]:
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
        }
    }
