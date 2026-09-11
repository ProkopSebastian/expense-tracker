"""Conservative bank lifecycle matching, independent of presentation and classification."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from decimal import Decimal

from .models import Transaction

INACTIVE = {"DECLINED", "REVERTED", "FAILED"}
PENDING = {"PENDING", "PROCESSING"}


def bank_state(raw: dict) -> str:
    return str(raw.get("State", "COMPLETED")).strip().upper()


def source_key(transaction: Transaction) -> str | None:
    raw = transaction.raw or {}
    if transaction.external_id:
        parts = [transaction.account, "id", transaction.external_id]
    elif raw.get("Started Date"):
        # Full timestamp, not the day. A collision is checked before updating any row.
        parts = [
            transaction.account,
            raw["Started Date"],
            raw.get("Product", ""),
            raw.get("Type", ""),
            transaction.currency,
        ]
    else:
        return None
    return hashlib.sha256(json.dumps(parts).encode()).hexdigest()


def reconcile(db: sqlite3.Connection, transaction: Transaction, fingerprint: str) -> bool:
    """Return True when consumed (updated, identical, or inactive without a predecessor)."""
    raw = transaction.raw or {}
    state = bank_state(raw)
    key = source_key(transaction)
    exact = db.execute("SELECT * FROM transactions WHERE fingerprint=?", (fingerprint,)).fetchone()
    candidates = db.execute("SELECT * FROM transactions WHERE source_key=?", (key,)).fetchall() if key else []
    candidate = exact
    if candidate is None and transaction.external_id and candidates:
        if len(candidates) != 1:
            raise ValueError("Niejednoznaczny identyfikator bankowy. Sprawdź eksport i rachunek.")
        candidate = candidates[0]
    if candidate is None and candidates:
        if len(candidates) > 1:
            raise ValueError("Kilka operacji ma ten sam czas i typ. Potrzebny eksport z identyfikatorami transakcji.")
        previous = candidates[0]
        if (
            bank_state(json.loads(previous["raw_json"])) in PENDING
            or state in PENDING | INACTIVE
            or previous["description"] == transaction.description
        ):
            candidate = previous
    if candidate is None:
        return state in INACTIVE
    old_state = bank_state(json.loads(candidate["raw_json"]))
    # Reimporting an older pending export must not undo settlement/cancellation.
    if old_state not in PENDING and state in PENDING:
        return True
    if old_state in INACTIVE and state not in INACTIVE:
        return True
    if (
        Decimal(candidate["amount"]) != transaction.amount
        or candidate["currency"] != transaction.currency
        or state in INACTIVE
    ):
        grouped = db.execute("SELECT 1 FROM case_members WHERE transaction_id=?", (candidate["id"],)).fetchone()
        if grouped:
            raise ValueError("Bank zmienił operację należącą do grupy. Rozwiąż tę grupę i ponów import.")
    db.execute(
        """UPDATE transactions SET booking_date=?,value_date=?,amount=?,currency=?,description=?,
        counterparty=?,balance=?,raw_json=?,fingerprint=?,source_key=?,bank_status=? WHERE id=?""",
        (
            str(transaction.booking_date),
            str(transaction.value_date) if transaction.value_date else None,
            str(transaction.amount),
            transaction.currency,
            transaction.description,
            transaction.counterparty,
            str(transaction.balance) if transaction.balance is not None else None,
            json.dumps(raw, ensure_ascii=False),
            fingerprint,
            key,
            state,
            candidate["id"],
        ),
    )
    return True
