from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from nome.polling import DEFAULT_ALLOWED_UPDATES, run_polling_worker
from nome.telegram_api import TelegramAPIError, TelegramBotAPI


class FakeHandler:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.raise_on: set[int] = set()

    async def handle_update(self, update: dict[str, Any], *, now: int | None = None) -> None:
        del now
        self.calls.append(update)
        update_id = update.get("update_id")
        if isinstance(update_id, int) and update_id in self.raise_on:
            raise RuntimeError("handler boom")


class FakeTelegram:
    def __init__(self, batches: list[list[dict[str, Any]] | Exception]) -> None:
        self._batches = batches
        self.requested_offsets: list[int | None] = []
        self.delete_webhook_calls: list[dict[str, Any]] = []

    async def get_updates(
        self,
        *,
        offset: int | None,
        timeout_seconds: int,
        allowed_updates: Any = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        del timeout_seconds, allowed_updates, limit
        self.requested_offsets.append(offset)
        if not self._batches:
            await asyncio.sleep(3600)
        next_value = self._batches.pop(0)
        if isinstance(next_value, Exception):
            raise next_value
        return next_value

    async def delete_webhook(self, *, drop_pending_updates: bool = False) -> None:
        self.delete_webhook_calls.append({"drop_pending_updates": drop_pending_updates})


@pytest.mark.asyncio
async def test_polling_advances_offset_after_successful_updates() -> None:
    handler = FakeHandler()
    telegram = FakeTelegram(
        batches=[
            [{"update_id": 10, "message": {"text": "hi"}}],
            [{"update_id": 11, "message": {"text": "there"}}],
        ]
    )

    task = asyncio.create_task(
        run_polling_worker(
            handler,  # type: ignore[arg-type]
            telegram,  # type: ignore[arg-type]
            long_poll_timeout_seconds=0,
            error_backoff_seconds=0.01,
        )
    )
    await _wait_until(lambda: len(handler.calls) >= 2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert telegram.requested_offsets[0] is None
    assert telegram.requested_offsets[1] == 11
    assert telegram.delete_webhook_calls == [{"drop_pending_updates": False}]


@pytest.mark.asyncio
async def test_polling_skips_updates_without_integer_id() -> None:
    handler = FakeHandler()
    telegram = FakeTelegram(
        batches=[
            [
                {"message": {"text": "broken"}},
                {"update_id": 5, "message": {"text": "ok"}},
            ],
        ]
    )

    task = asyncio.create_task(
        run_polling_worker(
            handler,  # type: ignore[arg-type]
            telegram,  # type: ignore[arg-type]
            long_poll_timeout_seconds=0,
            error_backoff_seconds=0.01,
        )
    )
    await _wait_until(lambda: 6 in telegram.requested_offsets)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert [call.get("update_id") for call in handler.calls] == [5]


@pytest.mark.asyncio
async def test_polling_advances_offset_after_handler_error() -> None:
    handler = FakeHandler()
    handler.raise_on = {7}
    telegram = FakeTelegram(
        batches=[
            [
                {"update_id": 7, "message": {"text": "boom"}},
                {"update_id": 8, "message": {"text": "ok"}},
            ],
        ]
    )

    task = asyncio.create_task(
        run_polling_worker(
            handler,  # type: ignore[arg-type]
            telegram,  # type: ignore[arg-type]
            long_poll_timeout_seconds=0,
            error_backoff_seconds=0.01,
        )
    )
    await _wait_until(lambda: 9 in telegram.requested_offsets)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert [call.get("update_id") for call in handler.calls] == [7, 8]


@pytest.mark.asyncio
async def test_polling_backs_off_on_telegram_error_and_continues() -> None:
    handler = FakeHandler()
    telegram = FakeTelegram(
        batches=[
            TelegramAPIError("boom", ambiguous=True),
            [{"update_id": 42, "message": {"text": "after"}}],
        ]
    )

    task = asyncio.create_task(
        run_polling_worker(
            handler,  # type: ignore[arg-type]
            telegram,  # type: ignore[arg-type]
            long_poll_timeout_seconds=0,
            error_backoff_seconds=0.01,
        )
    )
    await _wait_until(lambda: len(handler.calls) >= 1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert handler.calls[0]["update_id"] == 42


@pytest.mark.asyncio
async def test_polling_keeps_going_when_delete_webhook_fails() -> None:
    class ErroringTelegram(FakeTelegram):
        async def delete_webhook(self, *, drop_pending_updates: bool = False) -> None:
            del drop_pending_updates
            raise TelegramAPIError("nope")

    handler = FakeHandler()
    telegram = ErroringTelegram(
        batches=[[{"update_id": 1, "message": {"text": "hi"}}]],
    )

    task = asyncio.create_task(
        run_polling_worker(
            handler,  # type: ignore[arg-type]
            telegram,  # type: ignore[arg-type]
            long_poll_timeout_seconds=0,
            error_backoff_seconds=0.01,
        )
    )
    await _wait_until(lambda: handler.calls)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


@pytest.mark.asyncio
async def test_default_allowed_updates_cover_business_intake() -> None:
    assert "business_connection" in DEFAULT_ALLOWED_UPDATES
    assert "business_message" in DEFAULT_ALLOWED_UPDATES
    assert "message" in DEFAULT_ALLOWED_UPDATES
    assert "chat_member" in DEFAULT_ALLOWED_UPDATES


@pytest.mark.asyncio
async def test_get_updates_sends_long_poll_payload() -> None:
    captured: dict[str, Any] = {}

    def handle(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["payload"] = request.read()
        return httpx.Response(
            200,
            json={
                "ok": True,
                "result": [{"update_id": 1, "message": {"text": "ok"}}, "ignored"],
            },
        )

    transport = httpx.MockTransport(handle)
    async with httpx.AsyncClient(transport=transport) as client:
        telegram = TelegramBotAPI(bot_token="test-token", client=client)
        updates = await telegram.get_updates(
            offset=12, timeout_seconds=30, allowed_updates=("message",), limit=5
        )

    assert updates == [{"update_id": 1, "message": {"text": "ok"}}]
    assert captured["path"].endswith("/bottest-token/getUpdates")
    assert b'"offset":12' in captured["payload"]
    assert b'"timeout":30' in captured["payload"]
    assert b'"allowed_updates":["message"]' in captured["payload"]
    assert b'"limit":5' in captured["payload"]


@pytest.mark.asyncio
async def test_delete_webhook_posts_drop_flag() -> None:
    captured: dict[str, Any] = {}

    def handle(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["payload"] = request.read()
        return httpx.Response(200, json={"ok": True, "result": True})

    transport = httpx.MockTransport(handle)
    async with httpx.AsyncClient(transport=transport) as client:
        telegram = TelegramBotAPI(bot_token="test-token", client=client)
        await telegram.delete_webhook(drop_pending_updates=True)

    assert captured["path"].endswith("/deleteWebhook")
    assert b'"drop_pending_updates":true' in captured["payload"]


@pytest.mark.asyncio
async def test_get_chat_member_count_posts_chat_id() -> None:
    captured: dict[str, Any] = {}

    def handle(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["payload"] = request.read()
        return httpx.Response(200, json={"ok": True, "result": 89})

    transport = httpx.MockTransport(handle)
    async with httpx.AsyncClient(transport=transport) as client:
        telegram = TelegramBotAPI(bot_token="test-token", client=client)
        count = await telegram.get_chat_member_count(chat_id="@vibecodesh")

    assert count == 89
    assert captured["path"].endswith("/getChatMemberCount")
    assert b'"chat_id":"@vibecodesh"' in captured["payload"]


async def _wait_until(predicate: Any, *, timeout: float = 2.0) -> None:
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("Predicate did not become true in time.")
