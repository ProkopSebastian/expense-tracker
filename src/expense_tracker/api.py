"""Local HTTP adapter; business rules remain in the Python service modules."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Database
from .summary_service import PeriodMode, SummaryResponse, get_summary


def get_connection(request: Request) -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(request.app.state.database_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=5000")
    try:
        yield connection
    finally:
        connection.close()


def create_app(database_path: Path | None = None) -> FastAPI:
    path = database_path if database_path is not None else settings.database_path

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Initialize once; connections used by requests have independent lifetimes.
        database = Database(path)
        database.close()
        yield

    app = FastAPI(title="Expense Tracker", version="0.1.0", lifespan=lifespan)
    app.state.database_path = path

    @app.get("/api/summary", response_model=SummaryResponse)
    def read_summary(
        db: Annotated[sqlite3.Connection, Depends(get_connection)],
        mode: PeriodMode = "month",
        currency: Annotated[str | None, Query(pattern=r"^[A-Z]{3}$")] = None,
        month: Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")] = None,
        start: date | None = None,
        end: date | None = None,
    ) -> SummaryResponse:
        try:
            return get_summary(db, mode=mode, currency=currency, month=month, start=start, end=end)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    # A built frontend and API can be served by one local process.
    frontend = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if frontend.is_dir():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app


app = create_app()
