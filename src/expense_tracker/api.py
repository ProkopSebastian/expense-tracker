"""Local HTTP adapter; business rules remain in the Python service modules."""

from __future__ import annotations

import asyncio
import logging
import os
import sqlite3
import subprocess
import sys
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
from .web_models import ClientError
from .web_routes import router

logger = logging.getLogger("expense_tracker.frontend")


def create_app(database_path: Path | None = None) -> FastAPI:
    path = database_path if database_path is not None else settings.database_path

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Initialize once; connections used by requests have independent lifetimes.
        database = Database(path)
        database.close()
        from .preferences import load_preferences

        load_preferences(path)
        yield

    app = FastAPI(title="Expense Tracker", version="0.1.0", lifespan=lifespan)
    app.state.database_path = path
    from threading import Lock

    app.state.ai_lock = Lock()
    app.state.write_lock = asyncio.Lock()

    @app.middleware("http")
    async def local_writes(request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            allowed = {str(request.base_url).rstrip("/"), "http://127.0.0.1:5173", "http://localhost:5173"}
            if origin and origin not in allowed:
                return JSONResponse({"detail": "Niedozwolone źródło żądania."}, status_code=403)
        if request.method not in {"GET", "HEAD", "OPTIONS"} and request.url.path.startswith("/api/"):
            from starlette.concurrency import run_in_threadpool

            from .recovery import backup_database, record_undo

            async with app.state.write_lock:
                backup = await run_in_threadpool(backup_database, path, "action")
                response = await call_next(request)
                if request.url.path != "/api/undo":
                    await run_in_threadpool(record_undo, path, backup)
                return response
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

    @app.post("/report-error")
    def report_error(entry: ClientError) -> dict[str, bool]:
        logger.error(
            "Frontend crash on %s: %s\n%s\n%s",
            entry.url,
            entry.message,
            entry.component_stack,
            entry.stack,
        )
        return {"ok": True}

    @app.post("/open-data-folder")
    def open_data_folder() -> dict[str, bool]:
        folder = settings.data_dir.resolve()
        folder.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            os.startfile(folder)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(folder)])
        else:
            subprocess.Popen(["xdg-open", str(folder)])
        return {"ok": True}

    app.include_router(router)

    # A built frontend and API can be served by one local process.
    root = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[2]
    frontend = root / "frontend" / "dist"
    if frontend.is_dir():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app


app = create_app()
