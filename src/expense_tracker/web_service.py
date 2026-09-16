"""Application operations shared by the HTTP interface, independent of UI widgets."""

from __future__ import annotations

import sqlite3
from decimal import Decimal

from . import ledger
from .ledger_view import visible_counterparty
from .text_utils import clean_description
from .web_models import Decision, GroupEntry, ManualEntry


def category_exists(db: sqlite3.Connection, key: str) -> None:
    if not db.execute("SELECT 1 FROM categories WHERE key=?", (key,)).fetchone():
        raise ValueError("Nieznana kategoria.")


def transaction_exists(db: sqlite3.Connection, tid: int) -> None:
    row = db.execute("SELECT id FROM transactions WHERE id=?", (tid,)).fetchone()
    if not row:
        raise ValueError("Transakcja nie istnieje.")
    if db.execute("SELECT 1 FROM case_members WHERE transaction_id=?", (tid,)).fetchone():
        raise ValueError("Transakcja należy do grupy. Najpierw rozwiąż grupę.")


def decide(db: sqlite3.Connection, tid: int, entry: Decision) -> None:
    category_exists(db, entry.category_key)
    transaction_exists(db, tid)
    with db:
        ledger.save_decision(db, tid, entry.category_key, commit=False)
        if entry.remember:
            ledger.save_merchant_rule(db, tid, entry.category_key, commit=False)
            ledger.apply_rules(db, commit=False)


def add_manual(db: sqlite3.Connection, entry: ManualEntry) -> int:
    category_exists(db, entry.category_key)
    if entry.amount == 0:
        raise ValueError("Kwota musi być różna od zera.")
    return ledger.add_manual_transaction(db, **entry.model_dump())


def add_group(db: sqlite3.Connection, entry: GroupEntry) -> int:
    category_exists(db, entry.category_key)
    ids = [member.transaction_id for member in entry.members]
    if len(ids) != len(set(ids)):
        raise ValueError("Każda transakcja może wystąpić w grupie tylko raz.")
    # Acquire the write lock before validation to prevent overlapping groups from concurrent requests.
    with db:
        db.execute("BEGIN IMMEDIATE")
        for tid in ids:
            transaction_exists(db, tid)
            row = db.execute("SELECT currency FROM transactions WHERE id=?", (tid,)).fetchone()
            if row["currency"] != entry.currency:
                raise ValueError("Wszystkie transakcje muszą być w jednej walucie.")
        return ledger.create_case(
            db,
            entry.kind,
            entry.title,
            "transfer_own" if entry.kind == "own_transfer" else entry.category_key,
            Decimal(0) if entry.kind == "own_transfer" else entry.personal_amount,
            entry.currency,
            [(m.transaction_id, m.role) for m in entry.members],
            commit=False,
        )


def ledger_blocks(db: sqlite3.Connection, query: str, direction: str, category: list[str], page: int) -> dict:
    raw = ledger.transactions(db)
    cases = ledger.approved_cases(db)

    def item(row):
        return {
            "id": row["id"],
            "bank_status": row["bank_status"],
            "date": row["booking_date"],
            "account": row["account"],
            "description": clean_description(str(row["merchant"] or row["description"])),
            "counterparty": visible_counterparty(row),
            "amount": row["amount"],
            "currency": row["currency"],
            "category_key": row["category_key"],
            "category_label": row["category_label"] or "Do przypisania",
        }

    grouped = {case["id"]: [] for case in cases}
    blocks = []
    for row in raw:
        if row["case_id"] in grouped:
            grouped[row["case_id"]].append(item(row))
        else:
            record = item(row)
            blocks.append(
                {
                    **record,
                    "key": f"t{row['id']}",
                    "case_id": None,
                    "members": [],
                    "real_amount": "0" if row["category_key"] == "transfer_own" else row["amount"],
                }
            )
    for case in cases:
        blocks.append(
            {
                "key": f"c{case['id']}",
                "id": None,
                "case_id": case["id"],
                "date": case["booking_date"],
                "account": "Grupa",
                "description": case["title"],
                "counterparty": "",
                "amount": None,
                "real_amount": str(-Decimal(case["personal_amount"])),
                "currency": case["currency"],
                "category_key": case["category_key"],
                "category_label": case["category_label"] or "Do przypisania",
                "members": grouped[case["id"]],
            }
        )
    needle = query.casefold()
    filtered = []
    for block in blocks:
        if direction == "expense" and Decimal(block["real_amount"]) >= 0:
            continue
        if direction == "income" and Decimal(block["real_amount"]) <= 0:
            continue
        if category and (block["category_key"] or "") not in category:
            continue
        if needle and not any(
            needle in f"{r['description']} {r['counterparty']}".casefold() for r in [block, *block["members"]]
        ):
            continue
        filtered.append(block)
    filtered.sort(key=lambda b: b["date"], reverse=True)
    page_size = 50
    pages = max(1, (len(filtered) + page_size - 1) // page_size)
    page = min(page, pages)
    return {
        "blocks": filtered[(page - 1) * page_size : page * page_size],
        "page": page,
        "pages": pages,
        "total": len(filtered),
        "cases": cases,
        "relations": [s for s in ledger.pending_suggestions(db) if s["kind"] == "relation"],
    }


def classification_rows(db: sqlite3.Connection) -> list[dict]:
    raw = ledger.transactions(db)
    by_id = {row["id"]: row for row in raw}
    suggestions = [s for s in ledger.pending_suggestions(db) if s["kind"] == "merchant_classification"]
    covered = set()
    rows = []
    for s in suggestions:
        payload = s["payload"]
        members = [by_id[tid] for tid in payload["transaction_ids"] if tid in by_id]
        covered.update(payload["transaction_ids"])
        if not members:
            continue
        sample = members[0]
        totals = {}
        for row in members:
            totals[row["currency"]] = totals.get(row["currency"], Decimal(0)) + Decimal(row["amount"])
        rows.append(
            {
                "key": f"s{s['id']}",
                "suggestion_id": s["id"],
                "transaction_id": None,
                "description": clean_description(str(sample["merchant"] or sample["description"])),
                "date": sample["booking_date"],
                "counterparty": visible_counterparty(sample),
                "count": len(members),
                "totals": {key: str(value) for key, value in totals.items()},
                "members": [
                    {"date": m["booking_date"], "amount": m["amount"], "currency": m["currency"]} for m in members
                ],
                "category_key": None if payload["category_key"] == "uncategorized_expense" else payload["category_key"],
                "rationale": payload.get("rationale", ""),
                "confidence": payload.get("confidence"),
                "remember": payload.get("should_create_rule", False),
            }
        )
    for row in raw:
        if row["id"] in covered or row["category_key"] or row["case_id"]:
            continue
        rows.append(
            {
                "key": f"t{row['id']}",
                "suggestion_id": None,
                "transaction_id": row["id"],
                "description": clean_description(str(row["merchant"] or row["description"])),
                "date": row["booking_date"],
                "counterparty": visible_counterparty(row),
                "count": 1,
                "totals": {row["currency"]: row["amount"]},
                "category_key": None,
                "rationale": "",
                "confidence": None,
                "remember": False,
            }
        )
    return rows
