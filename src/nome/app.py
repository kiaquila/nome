from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request

from nome.config import Settings
from nome.handlers import UpdateHandler
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
        telegram = TelegramBotAPI(bot_token=runtime_settings.bot_token)
        handler = UpdateHandler(settings=runtime_settings, storage=storage, telegram=telegram)
        worker = asyncio.create_task(
            run_reply_worker(
                handler,
                poll_interval_seconds=runtime_settings.worker_poll_interval_seconds,
            )
        )
        app.state.nome_handler = handler
        try:
            yield
        finally:
            worker.cancel()
            try:
                await worker
            except asyncio.CancelledError:
                pass
            await telegram.close()

    app = FastAPI(title="Nome", lifespan=lifespan)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/telegram/webhook")
    async def telegram_webhook(
        request: Request,
        x_telegram_bot_api_secret_token: Annotated[
            str | None,
            Header(alias="X-Telegram-Bot-Api-Secret-Token"),
        ] = None,
    ) -> dict[str, bool]:
        if runtime_settings.webhook_secret_token:
            if x_telegram_bot_api_secret_token != runtime_settings.webhook_secret_token:
                raise HTTPException(status_code=401, detail="Invalid Telegram webhook secret.")

        payload: dict[str, Any] = await request.json()
        handler: UpdateHandler = request.app.state.nome_handler
        await handler.handle_update(payload)
        return {"ok": True}

    return app


app = create_app()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    uvicorn.run("nome.app:app", host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
