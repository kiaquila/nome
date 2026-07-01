from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import httpx


class TelegramAPIError(RuntimeError):
    """Raised when Telegram Bot API returns a failed response."""

    def __init__(self, message: str, *, ambiguous: bool = False) -> None:
        super().__init__(message)
        self.ambiguous = ambiguous


class TelegramBotAPI:
    def __init__(
        self,
        *,
        bot_token: str,
        client: httpx.AsyncClient | None = None,
        base_url: str = "https://api.telegram.org",
        long_poll_timeout_seconds: int = 50,
    ) -> None:
        self._bot_token = bot_token
        self._base_url = base_url.rstrip("/")
        # Telegram getUpdates can hold the connection open for the negotiated
        # long-poll timeout; keep the HTTP read budget a touch larger.
        read_timeout = max(long_poll_timeout_seconds + 10, 20)
        self._client = client or httpx.AsyncClient(timeout=httpx.Timeout(read_timeout, connect=10))
        self._owns_client = client is None

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def send_message(
        self,
        *,
        chat_id: int,
        text: str,
        business_connection_id: str | None = None,
    ) -> int | None:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": True,
        }
        if business_connection_id:
            payload["business_connection_id"] = business_connection_id

        result = await self._post_object("sendMessage", payload)
        message_id = result.get("message_id")
        return int(message_id) if message_id is not None else None

    async def get_business_connection(self, *, business_connection_id: str) -> dict[str, Any]:
        return await self._post_object(
            "getBusinessConnection",
            {"business_connection_id": business_connection_id},
        )

    async def get_chat_member_count(self, *, chat_id: str | int) -> int:
        result = await self._post_raw("getChatMemberCount", {"chat_id": chat_id})
        return int(result) if result is not None else 0

    async def get_updates(
        self,
        *,
        offset: int | None,
        timeout_seconds: int,
        allowed_updates: Sequence[str] | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {"timeout": timeout_seconds, "limit": limit}
        if offset is not None:
            payload["offset"] = offset
        if allowed_updates is not None:
            payload["allowed_updates"] = list(allowed_updates)
        result = await self._post_raw("getUpdates", payload)
        if not isinstance(result, list):
            return []
        return [update for update in result if isinstance(update, dict)]

    async def delete_webhook(self, *, drop_pending_updates: bool = False) -> None:
        await self._post_raw(
            "deleteWebhook",
            {"drop_pending_updates": drop_pending_updates},
        )

    async def _post_object(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
        result = await self._post_raw(method, payload)
        return result if isinstance(result, dict) else {}

    async def _post_raw(self, method: str, payload: dict[str, Any]) -> Any:
        try:
            response = await self._client.post(self._url(method), json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as error:
            raise TelegramAPIError(
                "telegram_http_error",
                ambiguous=error.response.status_code >= 500,
            ) from error
        except (httpx.TimeoutException, httpx.TransportError) as error:
            raise TelegramAPIError("telegram_http_error", ambiguous=True) from error
        except httpx.HTTPError as error:
            raise TelegramAPIError("telegram_http_error", ambiguous=True) from error

        data = response.json()
        if not data.get("ok"):
            description = data.get("description", "Telegram API request failed")
            raise TelegramAPIError(str(description))
        return data.get("result")

    def _url(self, method: str) -> str:
        return f"{self._base_url}/bot{self._bot_token}/{method}"
