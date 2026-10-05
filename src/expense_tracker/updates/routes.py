from __future__ import annotations

import secrets

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, StrictBool
from starlette.concurrency import run_in_threadpool

from expense_tracker.recovery import backup_database
from expense_tracker.version import VERSION

from .protocol import UpdateError

router = APIRouter(prefix="/api/updates")


class UpdatePreferences(BaseModel):
    automatic: StrictBool


def manager_for(request: Request, *, mutation: bool = False):
    manager = getattr(request.app.state, "updater", None)
    if manager is None:
        raise HTTPException(409, "Aktualizacje są dostępne w aplikacji desktopowej.")
    if request.url.hostname not in {"127.0.0.1", "localhost"}:
        raise HTTPException(403, "Niedozwolony adres aplikacji.")
    origin = request.headers.get("origin")
    if origin and origin != str(request.base_url).rstrip("/"):
        raise HTTPException(403, "Niedozwolone źródło żądania.")
    if mutation and not secrets.compare_digest(request.headers.get("x-update-token", ""), manager.token):
        raise HTTPException(403, "Odśwież okno aplikacji i spróbuj ponownie.")
    return manager


@router.get("")
def status(request: Request):
    if getattr(request.app.state, "updater", None) is None:
        return {"enabled": False, "current_version": VERSION}
    return manager_for(request).snapshot()


@router.post("/check")
def check(request: Request):
    manager = manager_for(request, mutation=True)
    manager.check()
    return manager.snapshot()


@router.post("/download")
def download(request: Request):
    manager = manager_for(request, mutation=True)
    try:
        manager.download()
    except UpdateError as error:
        raise HTTPException(409, str(error)) from error
    return manager.snapshot()


@router.post("/cancel")
def cancel(request: Request):
    manager = manager_for(request, mutation=True)
    manager.cancel()
    return manager.snapshot()


@router.put("/preferences")
def preferences(body: UpdatePreferences, request: Request):
    manager = manager_for(request, mutation=True)
    manager.set_automatic(body.automatic)
    return manager.snapshot()


@router.post("/install")
async def install(request: Request):
    manager = manager_for(request, mutation=True)
    async with request.app.state.write_lock:
        if manager.snapshot()["state"] != "ready":
            raise HTTPException(409, "Najpierw pobierz aktualizację.")
        try:
            await run_in_threadpool(backup_database, request.app.state.database_path, "update")
            await run_in_threadpool(manager.prepare_install)
        except UpdateError as error:
            raise HTTPException(409, str(error)) from error
        except OSError as error:
            raise HTTPException(
                409, "Nie udało się przygotować aktualizacji. Sprawdź wolne miejsce i uprawnienia.",
            ) from error
    manager.request_close()
    return manager.snapshot()
