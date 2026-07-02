from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from nome.config import Settings
from nome.handlers import UpdateHandler
from nome.polling import allowed_updates_for_channel_tracking, run_polling_worker
from nome.storage import SQLiteStorage
from nome.telegram_api import TelegramBotAPI
from nome.worker import run_reply_worker

LOGGER = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime_settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        storage = SQLiteStorage(runtime_settings.database_path)
        storage.initialize()
        telegram = TelegramBotAPI(
            bot_token=runtime_settings.bot_token,
            long_poll_timeout_seconds=runtime_settings.long_poll_timeout_seconds,
        )
        handler = UpdateHandler(settings=runtime_settings, storage=storage, telegram=telegram)
        reply_task = asyncio.create_task(
            run_reply_worker(
                handler,
                poll_interval_seconds=runtime_settings.worker_poll_interval_seconds,
            )
        )
        polling_task = asyncio.create_task(
            run_polling_worker(
                handler,
                telegram,
                long_poll_timeout_seconds=runtime_settings.long_poll_timeout_seconds,
                error_backoff_seconds=runtime_settings.polling_error_backoff_seconds,
                allowed_updates=allowed_updates_for_channel_tracking(
                    enabled=runtime_settings.channel_tracking_enabled
                ),
            )
        )
        app.state.nome_handler = handler
        try:
            yield
        finally:
            for task in (polling_task, reply_task):
                task.cancel()
            for task in (polling_task, reply_task):
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            await telegram.close()

    app = FastAPI(title="Nome", lifespan=lifespan)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    uvicorn.run("nome.app:app", host="127.0.0.1", port=8000)


if __name__ == "__main__":
    main()
