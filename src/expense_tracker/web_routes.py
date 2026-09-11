from __future__ import annotations

import sqlite3
from dataclasses import asdict
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from . import ledger
from . import web_service as service
from .api_dependencies import get_connection
from .config import settings
from .data_sync import sync_data_directory
from .database import Database
from .llm import service as ai

router = APIRouter(prefix="/api")
DB = Annotated[sqlite3.Connection, Depends(get_connection)]


@router.get("/meta")
def meta(db: DB):
    return {"categories": ledger.categories(db), "ai_enabled": bool(settings.openai_api_key)}


@router.get("/ledger")
def history(
    db: DB,
    q: str = "",
    direction: Literal["all", "expense", "income"] = "all",
    category: Annotated[list[str] | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
):
    return service.ledger_blocks(db, q, direction, category or [], page)


@router.post("/transactions", status_code=201)
def manual(entry: service.ManualEntry, db: DB):
    return {"id": service.add_manual(db, entry)}


@router.put("/transactions/{tid}/category")
def decision(tid: int, entry: service.Decision, db: DB):
    service.decide(db, tid, entry)
    return {"message": "Kategoria zapisana."}


@router.post("/cases", status_code=201)
def group(entry: service.GroupEntry, db: DB):
    return {"id": service.add_group(db, entry)}


@router.delete("/cases/{case_id}")
def dissolve(case_id: int, db: DB):
    if not db.execute("SELECT 1 FROM cases WHERE id=? AND status='approved'", (case_id,)).fetchone():
        raise ValueError("Grupa nie istnieje lub została już rozwiązana.")
    ledger.dissolve_case(db, case_id)
    return {"message": "Grupa rozwiązana. Transakcje wróciły do rejestru."}


@router.get("/classification")
def classification(db: DB):
    return {"rows": service.classification_rows(db)}


@router.post("/suggestions/{sid}/approve")
def approve(sid: int, db: DB, entry: service.Decision | None = None):
    suggestion = db.execute("SELECT kind FROM suggestions WHERE id=? AND status='suggested'", (sid,)).fetchone()
    if not suggestion:
        raise ValueError("Sugestia została już rozpatrzona.")
    if suggestion["kind"] == "merchant_classification":
        if entry is None:
            raise ValueError("Wybierz kategorię.")
        service.category_exists(db, entry.category_key)
        ledger.approve_merchant_suggestion_with_category(db, sid, entry.category_key, entry.remember)
    else:
        ledger.approve_suggestion(db, sid)
    return {"message": "Sugestia zatwierdzona."}


@router.post("/suggestions/{sid}/reject")
def reject(sid: int, db: DB):
    if not db.execute("SELECT 1 FROM suggestions WHERE id=? AND status='suggested'", (sid,)).fetchone():
        raise ValueError("Sugestia została już rozpatrzona.")
    ledger.reject_suggestion(db, sid)
    return {"message": "Sugestia odrzucona."}


@router.get("/rules")
def rules(db: DB):
    return {
        "rules": [
            {**rule, "name": str(rule["merchant_key"]).split("|", 1)[0].strip().title()}
            for rule in ledger.merchant_rules(db)
        ]
    }


@router.put("/rules/{rid}")
def update_rule(rid: int, entry: service.Decision, db: DB):
    service.category_exists(db, entry.category_key)
    if not db.execute("SELECT 1 FROM merchant_rules WHERE id=?", (rid,)).fetchone():
        raise ValueError("Reguła nie istnieje.")
    ledger.update_merchant_rule(db, rid, entry.category_key)
    return {"message": "Reguła i powiązane klasyfikacje zaktualizowane."}


@router.delete("/rules/{rid}")
def delete_rule(rid: int, db: DB):
    if not db.execute("SELECT 1 FROM merchant_rules WHERE id=?", (rid,)).fetchone():
        raise ValueError("Reguła nie istnieje.")
    ledger.delete_merchant_rule(db, rid)
    return {"message": "Reguła usunięta."}


@router.post("/sync")
def sync(request: Request):
    db = Database(request.app.state.database_path)
    try:
        return asdict(sync_data_directory(db, settings.data_dir))
    finally:
        db.close()


@router.post("/ai/{kind}")
def analyze(kind: Literal["merchants", "relations"], request: Request, db: DB):
    if not settings.openai_api_key:
        raise HTTPException(503, "Brakuje klucza AI w konfiguracji aplikacji.")
    lock = request.app.state.ai_lock
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "Analiza AI już trwa. Poczekaj na jej zakończenie.")
    try:
        if kind == "merchants":
            return asdict(ai.analyze_merchants(db))
        return {"saved": ai.analyze_relations(db)}
    except Exception as error:
        raise HTTPException(
            502, "Analiza AI nie powiodła się. Sprawdź połączenie i konfigurację, a potem spróbuj ponownie."
        ) from error
    finally:
        lock.release()
