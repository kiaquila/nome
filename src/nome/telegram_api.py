from __future__ import annotations

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
    ) -> None:
        self._bot_token = bot_token
        self._base_url = base_url.rstrip("/")
        self._client = client or httpx.AsyncClient(timeout=20)
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

        result = await self._post("sendMessage", payload)
        message_id = result.get("message_id")
        return int(message_id) if message_id is not None else None

    async def get_business_connection(self, *, business_connection_id: str) -> dict[str, Any]:
        return await self._post(
            "getBusinessConnection",
            {"business_connection_id": business_connection_id},
        )

    async def _post(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
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
        result = data.get("result")
        return result if isinstance(result, dict) else {}

    def _url(self, method: str) -> str:
        return f"{self._base_url}/bot{self._bot_token}/{method}"
