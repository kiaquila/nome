from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest

from nome.channel_roster_import import main as import_roster_main
from nome.channel_subscribers import ChannelMemberIdentity, parse_chat_member_change
from nome.config import Settings
from nome.handlers import UpdateHandler
from nome.storage import SQLiteStorage
from nome.telegram_api import TelegramAPIError


class FakeTelegram:
    def __init__(self, *, member_count: int | Exception = 0) -> None:
        self.sent: list[dict[str, Any]] = []
        self.member_count = member_count

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
        raise KeyError(business_connection_id)

    async def get_chat_member_count(self, *, chat_id: str | int) -> int:
        assert chat_id == "@vibecodesh"
        if isinstance(self.member_count, Exception):
            raise self.member_count
        return self.member_count


@pytest.fixture
def channel_handler(tmp_path: Path) -> tuple[UpdateHandler, SQLiteStorage, FakeTelegram]:
    storage = SQLiteStorage(tmp_path / "nome.sqlite3")
    storage.initialize()
    telegram = FakeTelegram(member_count=3)
    settings = Settings(
        bot_token="test-token",
        database_path=tmp_path / "nome.sqlite3",
        owner_chat_id=900,
        tracked_channel_username="vibecodesh",
        tracked_channel_threshold=3,
        channel_digest_interval_seconds=10,
        channel_count_check_interval_seconds=10,
        tracked_channel_count_offset=1,
    )
    handler = UpdateHandler(
        settings=settings,
        storage=storage,
        telegram=telegram,  # type: ignore[arg-type]
    )
    return handler, storage, telegram


def test_parse_chat_member_update_detects_join() -> None:
    change = parse_chat_member_change(
        _chat_member_update(
            old_status="left",
            new_status="member",
            user_id=42,
            username="NewReader",
        )["chat_member"]
    )

    assert change is not None
    assert change.kind == "joined"
    assert change.channel_username == "vibecodesh"
    assert change.user.username == "newreader"


@pytest.mark.asyncio
async def test_join_below_threshold_updates_roster_and_notifies_owner(
    channel_handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    handler, storage, telegram = channel_handler
    _seed_roster(storage, count=1, threshold=3)

    await handler.handle_update(
        _chat_member_update(old_status="left", new_status="member", user_id=2),
        now=200,
    )

    assert _member_count(storage.path) == 2
    assert len(telegram.sent) == 1
    assert "подписался" in telegram.sent[0]["text"]
    assert "Сейчас: 2/3" in telegram.sent[0]["text"]


@pytest.mark.asyncio
async def test_join_that_reaches_threshold_sends_final_immediate_notice(
    channel_handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    handler, storage, telegram = channel_handler
    _seed_roster(storage, count=2, threshold=3)

    await handler.handle_update(
        _chat_member_update(old_status="left", new_status="member", user_id=3),
        now=200,
    )

    assert len(telegram.sent) == 1
    assert "Сейчас: 3/3" in telegram.sent[0]["text"]
    assert "Порог достигнут" in telegram.sent[0]["text"]


@pytest.mark.asyncio
async def test_changes_after_threshold_are_aggregated_into_daily_digest(
    channel_handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    handler, storage, telegram = channel_handler
    _seed_roster(storage, count=3, threshold=3)

    await handler.handle_update(
        _chat_member_update(old_status="left", new_status="member", user_id=4),
        now=102,
    )
    assert telegram.sent == []

    assert await handler.process_due_channel_digest(now=111) == 1
    assert len(telegram.sent) == 1
    assert "ежедневная статистика" in telegram.sent[0]["text"]
    assert "+ подписались: 1" in telegram.sent[0]["text"]

    assert await handler.process_due_channel_digest(now=112) == 0


@pytest.mark.asyncio
async def test_leave_removes_member_from_current_roster(
    channel_handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    handler, storage, telegram = channel_handler
    _seed_roster(storage, count=2, threshold=3)

    await handler.handle_update(
        _chat_member_update(old_status="member", new_status="left", user_id=2),
        now=200,
    )

    assert _member_count(storage.path) == 1
    assert len(telegram.sent) == 1
    assert "отписался" in telegram.sent[0]["text"]


@pytest.mark.asyncio
async def test_replayed_leave_for_absent_member_is_ignored(
    channel_handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    handler, storage, telegram = channel_handler
    _seed_roster(storage, count=1, threshold=3)

    await handler.handle_update(
        _chat_member_update(old_status="member", new_status="left", user_id=2),
        now=200,
    )

    assert _member_count(storage.path) == 1
    assert telegram.sent == []


@pytest.mark.asyncio
async def test_count_check_reports_new_drift_once(
    channel_handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    handler, storage, telegram = channel_handler
    _seed_roster(storage, count=2, threshold=3)
    telegram.member_count = 5

    assert await handler.process_due_channel_count_check(now=200) is True
    assert len(telegram.sent) == 1
    assert "расхождение roster" in telegram.sent[0]["text"]
    assert "Telegram raw: 5" in telegram.sent[0]["text"]

    assert await handler.process_due_channel_count_check(now=211) is True
    assert len(telegram.sent) == 1


@pytest.mark.asyncio
async def test_failed_count_check_defers_next_attempt(
    channel_handler: tuple[UpdateHandler, SQLiteStorage, FakeTelegram],
) -> None:
    handler, storage, telegram = channel_handler
    _seed_roster(storage, count=2, threshold=3)
    telegram.member_count = TelegramAPIError("no access")

    assert await handler.process_due_channel_count_check(now=200) is False

    telegram.member_count = 3
    assert await handler.process_due_channel_count_check(now=201) is False
    assert await handler.process_due_channel_count_check(now=210) is True


def test_roster_import_prefers_configured_channel_key(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "nome.sqlite3"
    snapshot_path = tmp_path / "roster.json"
    snapshot_path.write_text(
        json.dumps(
            {
                "channel_username": "snapshotname",
                "channel_id": 123,
                "members": [
                    {
                        "user_id": 1,
                        "username": "reader",
                        "first_name": "Reader",
                        "last_name": None,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("NOME_DATABASE_PATH", str(database_path))
    monkeypatch.setenv("NOME_TRACKED_CHANNEL_ID", "-100123")
    monkeypatch.delenv("NOME_TRACKED_CHANNEL_USERNAME", raising=False)
    monkeypatch.setattr(
        "sys.argv",
        [
            "nome-channel-roster-import",
            "--input",
            str(snapshot_path),
        ],
    )

    import_roster_main()

    connection = sqlite3.connect(database_path)
    try:
        rows = connection.execute("SELECT channel_key, user_id FROM channel_members").fetchall()
    finally:
        connection.close()
    assert rows == [("-100123", 1)]


def _seed_roster(storage: SQLiteStorage, *, count: int, threshold: int) -> None:
    storage.import_channel_roster(
        channel_key="vibecodesh",
        channel_id=-1003750588137,
        channel_username="vibecodesh",
        channel_title="Vibecode",
        members=[
            ChannelMemberIdentity(
                user_id=user_id,
                username=f"user{user_id}",
                first_name=f"User {user_id}",
                last_name=None,
            )
            for user_id in range(1, count + 1)
        ],
        now=100,
        threshold=threshold,
    )


def _member_count(path: Path) -> int:
    connection = sqlite3.connect(path)
    try:
        row = connection.execute("SELECT COUNT(*) FROM channel_members").fetchone()
    finally:
        connection.close()
    assert row is not None
    return int(row[0])


def _chat_member_update(
    *,
    old_status: str,
    new_status: str,
    user_id: int,
    username: str | None = None,
) -> dict[str, Any]:
    user = {
        "id": user_id,
        "is_bot": False,
        "first_name": f"User {user_id}",
        "username": username or f"user{user_id}",
    }
    return {
        "update_id": user_id,
        "chat_member": {
            "chat": {
                "id": -1003750588137,
                "type": "channel",
                "title": "Vibecode",
                "username": "vibecodesh",
            },
            "from": {"id": 1, "is_bot": False, "first_name": "Owner"},
            "date": 200,
            "old_chat_member": {"status": old_status, "user": user},
            "new_chat_member": {"status": new_status, "user": user},
        },
    }
