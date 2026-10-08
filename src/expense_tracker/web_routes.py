from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import asdict
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from openai import APIConnectionError, APIStatusError, AuthenticationError, PermissionDeniedError, RateLimitError
from pydantic import BaseModel

from . import cash_service, ledger, wallet_service, wealth_service
from . import web_service as service
from .api_dependencies import get_connection
from .config import settings
from .data_sync import sync_data_directory
from .database import Database
from .llm import service as ai
from .preferences import AIPreferences, save_preferences
from .web_models import (
    AssetCreate,
    AssetUpdate,
    BatchApproval,
    CategoryEntry,
    Decision,
    GroupEntry,
    ManualEntry,
    SnapshotEntry,
    WalletConvert,
    WalletCreate,
    WalletFundEntry,
    WalletOpening,
    WalletOpeningRate,
    CashCount,
    CashExchange,
    CashForeignWithdrawal,
    WalletReconcile,
    WalletSell,
)

router = APIRouter(prefix="/api")
DB = Annotated[sqlite3.Connection, Depends(get_connection)]
logger = logging.getLogger("expense_tracker.ai")


class ResetDataConfirmation(BaseModel):
    confirmation: Literal["USUŃ DANE"]


ThemeName = Literal[
    "system",
    "light",
    "dark",
    "ocean",
    "forest",
    "rose",
    "sand",
    "midnight",
    "mocha",
    "lavender",
    "nord",
    "dracula",
    "gruvbox",
    "one-dark",
    "tokyo-night",
    "catppuccin",
]


class AppearancePreference(BaseModel):
    theme: ThemeName


def _appearance_path(configuration_dir: Path) -> Path:
    return configuration_dir / "appearance.json"


@router.get("/settings/appearance", response_model=AppearancePreference)
def get_appearance(request: Request):
    path = _appearance_path(request.app.state.configuration_dir)
    if not path.exists():
        return AppearancePreference(theme="system")
    try:
        return AppearancePreference.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return AppearancePreference(theme="system")


@router.put("/settings/appearance")
def save_appearance(entry: AppearancePreference, request: Request):
    path = _appearance_path(request.app.state.configuration_dir)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(entry.model_dump()), encoding="utf-8")
    temporary.replace(path)
    return entry


@router.get("/meta")
def meta(db: DB):
    accounts = [
        str(row["account"])
        for row in db.execute(
            "SELECT DISTINCT account FROM transactions ORDER BY account COLLATE NOCASE"
        ).fetchall()
    ]
    return {
        "categories": ledger.categories(db),
        "accounts": accounts,
        "ai_enabled": bool(settings.openai_api_key),
    }


@router.get("/ledger")
def history(
    db: DB,
    q: str = "",
    direction: Literal["all", "expense", "income"] = "all",
    category: Annotated[list[str] | None, Query()] = None,
    currency: Annotated[list[str] | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
):
    return service.ledger_blocks(db, q, direction, category or [], currency or [], page)


@router.post("/transactions", status_code=201)
def manual(entry: ManualEntry, db: DB):
    return {"id": service.add_manual(db, entry)}


@router.post("/categories", status_code=201)
def create_category(entry: CategoryEntry, db: DB):
    return service.add_category(db, entry)


@router.put("/transactions/{tid}")
def update_manual(tid: int, entry: ManualEntry, db: DB):
    service.update_manual(db, tid, entry)
    return {"message": "Wpis zapisany."}


@router.delete("/transactions/{tid}")
def delete_manual(tid: int, db: DB):
    ledger.delete_manual_transaction(db, tid)
    return {"message": "Wpis usunięty."}


@router.put("/transactions/{tid}/category")
def decision(tid: int, entry: Decision, db: DB):
    service.decide(db, tid, entry)
    return {"message": "Kategoria zapisana."}


@router.post("/cases", status_code=201)
def group(entry: GroupEntry, db: DB):
    return {"id": service.add_group(db, entry)}


@router.delete("/cases/{case_id}")
def dissolve(case_id: int, db: DB):
    if not db.execute("SELECT 1 FROM cases WHERE id=? AND status='approved'", (case_id,)).fetchone():
        raise ValueError("Grupa nie istnieje lub została już rozwiązana.")
    ledger.dissolve_case(db, case_id)
    return {"message": "Grupa rozwiązana. Transakcje wróciły do rejestru."}


@router.get("/wallets")
def wallets(db: DB):
    return {"wallets": wallet_service.list_wallets(db)}


@router.post("/wallets", status_code=201)
def create_wallet(entry: WalletCreate, db: DB):
    return {"id": wallet_service.create_wallet(db, entry.account, entry.currency)}


@router.delete("/wallets/{wallet_id}")
def delete_wallet(wallet_id: int, db: DB):
    wallet_service.delete_wallet(db, wallet_id)
    return {"message": "Portfel usunięty."}


@router.post("/wallets/{wallet_id}/fund", status_code=201)
def fund_wallet(wallet_id: int, entry: WalletFundEntry, db: DB):
    if entry.fee_amount > 0 and entry.fee_category_key:
        service.category_exists(db, entry.fee_category_key)
    return {"case_id": wallet_service.fund_wallet(db, wallet_id=wallet_id, **entry.model_dump())}


@router.post("/wallets/{wallet_id}/convert", status_code=201)
def convert_wallet(wallet_id: int, entry: WalletConvert, db: DB):
    return {"case_id": wallet_service.convert_wallet(db, wallet_id=wallet_id, **entry.model_dump())}


@router.get("/wallets/{wallet_id}/sale-preview")
def preview_sale(
    wallet_id: int, db: DB, proceeds_transaction_id: int,
    given_amount: Annotated[Decimal, Query(gt=0, max_digits=18, decimal_places=2)],
    source_transaction_id: int | None = None,
):
    return wallet_service.sale_preview(
        db, wallet_id=wallet_id, proceeds_transaction_id=proceeds_transaction_id,
        given_amount=given_amount, source_transaction_id=source_transaction_id,
    )


@router.post("/wallets/{wallet_id}/sell", status_code=201)
def sell_wallet(wallet_id: int, entry: WalletSell, db: DB):
    return {"case_id": wallet_service.sell_wallet(db, wallet_id=wallet_id, **entry.model_dump())}


@router.post("/wallets/{wallet_id}/opening", status_code=201)
def wallet_opening(wallet_id: int, entry: WalletOpening, db: DB):
    return {"id": wallet_service.set_opening_balance(db, wallet_id=wallet_id, **entry.model_dump())}


@router.put("/wallets/{wallet_id}/opening-rate")
def set_opening_rate(wallet_id: int, entry: WalletOpeningRate, db: DB):
    wallet_service.set_opening_rate(db, wallet_id=wallet_id, pln_cost=entry.pln_cost)
    return {"message": "Kurs zapisany."}


@router.delete("/wallets/{wallet_id}/opening-rate")
def clear_opening_rate(wallet_id: int, db: DB):
    wallet_service.clear_opening_rate(db, wallet_id)
    return {"message": "Kurs usunięty."}


@router.post("/wallets/{wallet_id}/reconcile", status_code=201)
def reconcile_wallet(wallet_id: int, entry: WalletReconcile, db: DB):
    for line in entry.lines:
        service.category_exists(db, line.category_key)
    created = wallet_service.reconcile_wallet(
        db,
        wallet_id=wallet_id,
        remaining=entry.remaining,
        booking_date=entry.booking_date,
        lines=[(line.amount, line.category_key, line.description) for line in entry.lines],
    )
    return {"created": created}


@router.get("/wallets/{wallet_id}/history")
def wallet_history(wallet_id: int, db: DB):
    return {"history": wallet_service.wallet_history(db, wallet_id)}


def _money(value):
    return str(value) if value is not None else None


@router.get("/cash")
def cash(db: DB):
    state = cash_service.cash_state(db)
    return {
        "pots": [
            {
                "currency": currency, "balance": str(pot.balance),
                "average_cost": _money(pot.average_cost.quantize(Decimal("0.000001")) if pot.average_cost is not None else None),
                "pln_value": _money(pot.value(pot.balance) if pot.balance > 0 else Decimal(0)),
                "counted_on": pot.counted_on,
            }
            for currency, pot in sorted(state.pots.items(), key=lambda item: (item[0] != "PLN", item[0]))
        ],
        "flows": [{**flow, "amount": str(flow["amount"]), "cost": _money(flow["cost"])} for flow in state.flows],
        "exchanges": [
            {
                **exchange, "given_amount": str(exchange["given_amount"]),
                "received_amount": str(exchange["received_amount"]), "fx_result": _money(exchange.get("fx_result")),
            }
            for exchange in state.exchanges
        ],
        "counts": [
            {
                "id": count.id, "currency": count.currency, "counted_on": count.counted_on,
                "start_cost": _money(count.start_cost),
                "amount": str(count.amount), "first": count.first, "spent": str(count.spent),
                "correction": str(count.correction), "unassigned": str(count.unassigned),
                "lines": [{**line, "amount": str(line["amount"])} for line in count.lines],
            }
            for count in state.counts
        ],
    }


@router.get("/cash/count-preview")
def cash_count_preview(
    db: DB, counted_on: date, currency: Annotated[str, Query(pattern=r"^[A-Z]{3}$")],
    amount: Annotated[Decimal, Query(ge=0, max_digits=18, decimal_places=2)], replacing: int | None = None,
):
    count = cash_service.count_preview(db, currency=currency, counted_on=counted_on, amount=amount, replacing=replacing)
    return {"first": count.first, "spent": str(count.spent), "correction": str(count.correction)}


def _save_count(db, entry: CashCount, count_id: int | None = None) -> int:
    for line in entry.lines:
        service.category_exists(db, line.category_key)
    return cash_service.save_count(
        db, count_id=count_id, currency=entry.currency, counted_on=entry.counted_on, amount=entry.amount,
        start_cost=entry.start_cost, lines=[(line.amount, line.category_key, line.description) for line in entry.lines],
    )


@router.post("/cash/counts", status_code=201)
def add_cash_count(entry: CashCount, db: DB):
    return {"id": _save_count(db, entry)}


@router.put("/cash/counts/{count_id}")
def update_cash_count(count_id: int, entry: CashCount, db: DB):
    return {"id": _save_count(db, entry, count_id)}


@router.delete("/cash/counts/{count_id}")
def delete_cash_count(count_id: int, db: DB):
    cash_service.delete_count(db, count_id)
    return {"message": "Liczenie usunięte."}


@router.put("/cash/withdrawals/{transaction_id}/currency")
def set_withdrawal_currency(transaction_id: int, entry: CashForeignWithdrawal, db: DB):
    cash_service.set_withdrawal_currency(db, transaction_id, entry.currency, entry.amount)
    return {"message": "Zapisano."}


@router.delete("/cash/withdrawals/{transaction_id}/currency")
def clear_withdrawal_currency(transaction_id: int, db: DB):
    cash_service.clear_withdrawal_currency(db, transaction_id)
    return {"message": "Zapisano."}


@router.post("/cash/exchanges", status_code=201)
def add_cash_exchange(entry: CashExchange, db: DB):
    return {"id": cash_service.save_exchange(db, **entry.model_dump())}


@router.put("/cash/exchanges/{exchange_id}")
def update_cash_exchange(exchange_id: int, entry: CashExchange, db: DB):
    return {"id": cash_service.save_exchange(db, exchange_id=exchange_id, **entry.model_dump())}


@router.delete("/cash/exchanges/{exchange_id}")
def delete_cash_exchange(exchange_id: int, db: DB):
    cash_service.delete_exchange(db, exchange_id)
    return {"message": "Wymiana usunięta."}


@router.get("/wealth")
def wealth(db: DB):
    return wealth_service.wealth_overview(db)


@router.post("/wealth/assets", status_code=201)
def create_asset(entry: AssetCreate, db: DB):
    return {"id": wealth_service.create_asset(db, **entry.model_dump())}


@router.put("/wealth/assets/{asset_id}")
def update_asset(asset_id: int, entry: AssetUpdate, db: DB):
    wealth_service.update_asset(db, asset_id, **entry.model_dump())
    return {"message": "Składnik zapisany."}


@router.delete("/wealth/assets/{asset_id}")
def delete_asset(asset_id: int, db: DB):
    wealth_service.delete_asset(db, asset_id)
    return {"message": "Składnik usunięty."}


def _save_snapshot(db: sqlite3.Connection, entry: SnapshotEntry, snapshot_id: int | None = None) -> int:
    return wealth_service.save_snapshot(
        db,
        day=entry.day,
        balances=[(balance.asset_id, balance.amount) for balance in entry.balances],
        rates=entry.rates,
        snapshot_id=snapshot_id,
    )


@router.post("/wealth/snapshots", status_code=201)
def save_snapshot(entry: SnapshotEntry, db: DB):
    return {"id": _save_snapshot(db, entry)}


@router.put("/wealth/snapshots/{snapshot_id}")
def update_snapshot(snapshot_id: int, entry: SnapshotEntry, db: DB):
    return {"id": _save_snapshot(db, entry, snapshot_id)}


@router.delete("/wealth/snapshots/{snapshot_id}")
def delete_snapshot(snapshot_id: int, db: DB):
    wealth_service.delete_snapshot(db, snapshot_id)
    return {"message": "Stan majątku usunięty."}


@router.get("/classification")
def classification(db: DB):
    return {
        "rows": service.classification_rows(db),
        "relations": service.relation_suggestions(db),
    }


# One request, so the backup taken before it lets a single undo revert the whole batch.
@router.post("/suggestions/approve-all")
def approve_all(entry: BatchApproval, db: DB):
    with db:
        db.execute("BEGIN IMMEDIATE")
        for item in entry.items:
            _approve(item.id, db, item, commit=False, apply_remembered_rules=False)
        if any(item.remember for item in entry.items):
            ledger.apply_rules(db, commit=False)
    return {"message": f"Zatwierdzono {len(entry.items)} sugestii."}


@router.post("/suggestions/{sid}/approve")
def approve(sid: int, db: DB, entry: Decision | None = None):
    return _approve(sid, db, entry)


def _approve(
    sid: int, db: sqlite3.Connection, entry: Decision | None,
    *, commit: bool = True, apply_remembered_rules: bool = True,
):
    suggestion = db.execute("SELECT kind FROM suggestions WHERE id=? AND status='suggested'", (sid,)).fetchone()
    if not suggestion:
        raise ValueError("Sugestia została już rozpatrzona.")
    if suggestion["kind"] == "merchant_classification":
        if entry is None:
            raise ValueError("Wybierz kategorię.")
        service.category_exists(db, entry.category_key)
        ledger.approve_merchant_suggestion_with_category(
            db, sid, entry.category_key, entry.remember,
            commit=commit, apply_remembered_rules=apply_remembered_rules,
        )
    else:
        ledger.approve_suggestion(db, sid, commit=commit)
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
def update_rule(rid: int, entry: Decision, db: DB):
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
    except AuthenticationError as error:
        logger.warning("AI authentication failed (status=%s, code=%s)", error.status_code, error.code)
        raise HTTPException(
            401,
            "Klucz API jest nieprawidłowy lub został unieważniony. Dodaj poprawny klucz w zakładce Dane i ustawienia.",
        ) from error
    except PermissionDeniedError as error:
        logger.warning("AI access denied (status=%s, code=%s)", error.status_code, error.code)
        raise HTTPException(
            403, "Klucz API nie ma dostępu do tej usługi lub modelu. Sprawdź ustawienia konta OpenAI."
        ) from error
    except RateLimitError as error:
        logger.warning("AI rate limited (status=%s, code=%s)", error.status_code, error.code)
        if error.code in {"insufficient_quota", "billing_hard_limit_reached"}:
            raise HTTPException(
                429, "Brak dostępnych środków lub przekroczono budżet API. Sprawdź rozliczenia konta OpenAI."
            ) from error
        raise HTTPException(
            429, "Przekroczono chwilowy limit zapytań AI. Odczekaj chwilę i spróbuj ponownie."
        ) from error
    except APIConnectionError as error:
        logger.warning("AI connection failed (%s)", type(error).__name__)
        raise HTTPException(502, "Nie udało się połączyć z usługą AI. Sprawdź internet i spróbuj ponownie.") from error
    except APIStatusError as error:
        logger.warning("AI request failed (status=%s, code=%s)", error.status_code, error.code)
        raise HTTPException(
            502, "Usługa AI odrzuciła żądanie. Spróbuj ponownie później lub sprawdź konfigurację."
        ) from error
    except Exception as error:
        logger.exception("Unexpected AI analysis failure")
        raise HTTPException(502, "Analiza AI nie powiodła się. Spróbuj ponownie później.") from error
    finally:
        lock.release()


@router.get("/accounts/coverage")
def accounts_coverage(db: DB):
    return {"accounts": service.account_coverage(db)}


@router.get("/recovery")
def recovery(request: Request):
    from .recovery import undo_available

    return undo_available(request.app.state.database_path)


@router.post("/undo")
def undo(request: Request):
    from .recovery import undo_last

    undo_last(request.app.state.database_path)
    return {"message": "Ostatnia zmiana została cofnięta."}


@router.post("/import")
async def upload(request: Request, account: Annotated[str | None, Query(min_length=1, max_length=80)] = None):
    from pathlib import Path
    from tempfile import TemporaryDirectory

    from starlette.concurrency import run_in_threadpool

    from .data_sync import SUPPORTED_SUFFIXES, import_file

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 20 * 1024 * 1024:
            raise HTTPException(413, "Maksymalny rozmiar pliku to 20 MB.")
    if not body:
        raise ValueError("Plik jest pusty.")
    suffix = Path(request.headers.get("x-file-name", "upload.csv")).suffix.casefold()
    if suffix not in SUPPORTED_SUFFIXES:
        raise ValueError("Obsługiwane pliki mają rozszerzenie CSV lub PDF.")

    def run_import():
        with TemporaryDirectory() as directory:
            path = Path(directory) / f"upload{suffix}"
            path.write_bytes(body)
            database = Database(request.app.state.database_path)
            try:
                return import_file(database, path, account.strip() if account else None)
            finally:
                database.close()

    outcome = await run_in_threadpool(run_import)
    if outcome is None:
        return {"message": "Ten plik został już wczytany."}
    pairs = (
        f" Rozpoznane wymiany walut: {outcome.paired}, portfele zasilone automatycznie."
        if outcome.paired
        else ""
    )
    return {
        "message": f"Import zakończony. Nowe transakcje: {outcome.inserted}. "
        f"Istniejące operacje zostały sprawdzone i zaktualizowane.{pairs}"
    }


@router.put("/settings/ai")
def configure_ai(entry: AIPreferences, request: Request):
    save_preferences(request.app.state.configuration_dir, entry)
    return {"message": "Ustawienia AI zapisane."}


@router.post("/settings/reset-data")
def reset_data(entry: ResetDataConfirmation, request: Request):
    from .data_reset import reset_financial_data

    reset_financial_data(request.app.state.database_path, settings.data_dir)
    return {
        "message": "Dane finansowe zostały usunięte.",
        "api_key_preserved": bool(settings.openai_api_key),
    }
