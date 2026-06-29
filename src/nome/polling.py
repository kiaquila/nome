from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence

from nome.handlers import UpdateHandler
from nome.telegram_api import TelegramAPIError, TelegramBotAPI

LOGGER = logging.getLogger(__name__)

DEFAULT_ALLOWED_UPDATES: tuple[str, ...] = (
    "message",
    "business_connection",
    "business_message",
)


async def run_polling_worker(
    handler: UpdateHandler,
    telegram: TelegramBotAPI,
    *,
    long_poll_timeout_seconds: int,
    error_backoff_seconds: float,
    allowed_updates: Sequence[str] = DEFAULT_ALLOWED_UPDATES,
) -> None:
    """Continuously consume Telegram updates via getUpdates long polling.

    The loop owns the highest acknowledged update id in memory. On startup it
    asks Telegram to drop any active webhook so getUpdates does not race against
    a stale subscription. Each successfully handled update advances the offset
    so Telegram retires it from the queue.
    """
    try:
        await telegram.delete_webhook(drop_pending_updates=False)
    except TelegramAPIError as error:
        LOGGER.warning(
            "Could not detach Telegram webhook before polling: %s",
            type(error).__name__,
        )
    except OSError as error:
        LOGGER.warning(
            "Network error while detaching Telegram webhook: %s",
            type(error).__name__,
        )

    offset: int | None = None
    while True:
        try:
            updates = await telegram.get_updates(
                offset=offset,
                timeout_seconds=long_poll_timeout_seconds,
                allowed_updates=allowed_updates,
            )
        except asyncio.CancelledError:
            raise
        except TelegramAPIError as error:
            LOGGER.warning(
                "Telegram getUpdates failed: %s",
                type(error).__name__,
            )
            await asyncio.sleep(error_backoff_seconds)
            continue
        except OSError as error:
            LOGGER.warning(
                "Network error during Telegram getUpdates: %s",
                type(error).__name__,
            )
            await asyncio.sleep(error_backoff_seconds)
            continue

        for update in updates:
            update_id = update.get("update_id")
            if not isinstance(update_id, int):
                continue
            try:
                await handler.handle_update(update)
            except asyncio.CancelledError:
                raise
            except Exception:
                LOGGER.exception("Telegram update handling failed; advancing offset.")
            # Advance offset whether or not the handler raised — re-delivering a
            # failing update would block every later update behind it.
            offset = update_id + 1
