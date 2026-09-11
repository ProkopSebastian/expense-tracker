"""Local HTTP adapter; business rules remain in the Python service modules."""

from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .api_dependencies import get_connection
from .config import settings
from .database import Database
from .summary_service import PeriodMode, SummaryResponse, get_summary
from .web_routes import router


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
    from threading import Lock

    app.state.ai_lock = Lock()

    @app.middleware("http")
    async def local_writes(request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            allowed = {str(request.base_url).rstrip("/"), "http://127.0.0.1:5173", "http://localhost:5173"}
            if origin and origin not in allowed:
                return JSONResponse({"detail": "Niedozwolone źródło żądania."}, status_code=403)
        return await call_next(request)

    @app.exception_handler(ValueError)
    async def invalid_operation(request, error):
        return JSONResponse({"detail": str(error)}, status_code=422)

    @app.exception_handler(sqlite3.IntegrityError)
    async def conflicting_operation(request, error):
        return JSONResponse({"detail": "Dane zmieniły się. Odśwież widok i spróbuj ponownie."}, status_code=409)

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

    app.include_router(router)

    # A built frontend and API can be served by one local process.
    frontend = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if frontend.is_dir():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app


app = create_app()
