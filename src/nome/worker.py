from __future__ import annotations

import asyncio
import logging

from nome.handlers import UpdateHandler

LOGGER = logging.getLogger(__name__)


async def run_reply_worker(
    handler: UpdateHandler,
    *,
    poll_interval_seconds: float,
) -> None:
    while True:
        try:
            await handler.process_due_replies()
        except Exception:
            LOGGER.exception("Away-reply worker iteration failed.")
        try:
            await handler.process_due_channel_digest()
        except Exception:
            LOGGER.exception("Channel digest worker iteration failed.")
        try:
            await handler.process_due_channel_count_check()
        except Exception:
            LOGGER.exception("Channel count-check worker iteration failed.")
        await asyncio.sleep(poll_interval_seconds)
