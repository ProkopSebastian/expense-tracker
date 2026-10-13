"""Application operations shared by the HTTP interface, independent of UI widgets."""

from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from datetime import date
from decimal import Decimal

from . import cash_service, ledger
from .cash_flows import OFF_BALANCE
from .ledger_view import display_title, visible_counterparty
from .llm.prompts import PROMPT_VERSION
from .web_models import CategoryEntry, Decision, GroupEntry, GroupUpdate, ManualEntry

HOME_CURRENCY = "PLN"

_POLISH_TRANSLITERATION = str.maketrans({"ł": "l", "Ł": "L"})


def category_exists(db: sqlite3.Connection, key: str) -> None:
    if not db.execute("SELECT 1 FROM categories WHERE key=?", (key,)).fetchone():
        raise ValueError("Nieznana kategoria.")


def _slugify_unique(db: sqlite3.Connection, label: str) -> str:
    # NFKD strips most Polish diacritics (ą, ć, ę, ń, ó, ś, ź, ż); ł needs an explicit map first.
    normalized = unicodedata.normalize("NFKD", label.translate(_POLISH_TRANSLITERATION))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_text).strip("_") or "kategoria"
    key = f"custom_{slug}"
    candidate = key
    suffix = 2
    while db.execute("SELECT 1 FROM categories WHERE key=?", (candidate,)).fetchone():
        candidate = f"{key}_{suffix}"
        suffix += 1
    return candidate


def add_category(db: sqlite3.Connection, entry: CategoryEntry) -> dict[str, object]:
    kind = "expense"
    if entry.parent_key:
        parent = db.execute("SELECT kind FROM categories WHERE key=?", (entry.parent_key,)).fetchone()
        if not parent:
            raise ValueError("Nieznana kategoria nadrzędna.")
        kind = parent["kind"]
    key = _slugify_unique(db, entry.label)
    db.execute(
        "INSERT INTO categories(key, label, parent_key, kind, icon, color, is_custom) VALUES (?, ?, ?, ?, ?, ?, 1)",
        (key, entry.label, entry.parent_key, kind, entry.icon, entry.color),
    )
    db.commit()
    return {
        "key": key,
        "label": entry.label,
        "parent_key": entry.parent_key,
        "kind": kind,
        "icon": entry.icon,
        "color": entry.color,
        "is_custom": True,
    }


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
    fields = entry.model_dump()
    fields["account"] = ledger.canonical_account(db, entry.account)
    return ledger.add_manual_transaction(db, **fields)


def update_manual(db: sqlite3.Connection, transaction_id: int, entry: ManualEntry) -> None:
    category_exists(db, entry.category_key)
    if entry.amount == 0:
        raise ValueError("Kwota musi być różna od zera.")
    fields = entry.model_dump()
    fields["account"] = ledger.canonical_account(db, entry.account)
    ledger.update_manual_transaction(db, transaction_id, **fields)


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
        _require_cost_currency(_currencies(db, ids), entry.currency)
        return ledger.create_case(
            db,
            entry.kind,
            entry.title,
            "transfer_own" if entry.kind == "own_transfer" else entry.category_key,
            Decimal(0) if entry.kind == "own_transfer" else entry.personal_amount,
            entry.currency,
            [(m.transaction_id, m.role) for m in entry.members],
            booked_on=entry.booked_on,
            commit=False,
        )


def _currencies(db: sqlite3.Connection, ids: list[int]) -> set[str]:
    placeholders = ",".join("?" * len(ids))
    rows = db.execute(f"SELECT currency FROM transactions WHERE id IN ({placeholders})", ids)
    return {row["currency"] for row in rows}


def _require_cost_currency(currencies: set[str], currency: str) -> None:
    # A group spanning currencies has no native unit, so its real cost is stated in złoty.
    if len(currencies) > 1 and currency != HOME_CURRENCY:
        raise ValueError("Grupa łączy różne waluty, więc koszt podaj w złotówkach.")
    if len(currencies) == 1 and currency not in currencies | {HOME_CURRENCY}:
        raise ValueError("Waluta kosztu musi pasować do transakcji albo być złotówką.")


def _member_ids(db: sqlite3.Connection, case_id: int) -> list[int]:
    rows = db.execute("SELECT transaction_id FROM case_members WHERE case_id=?", (case_id,))
    return [row["transaction_id"] for row in rows]


def update_group(db: sqlite3.Connection, case_id: int, entry: GroupUpdate) -> None:
    category_exists(db, entry.category_key)
    if len(entry.add) != len(set(entry.add)):
        raise ValueError("Każda transakcja może wystąpić w grupie tylko raz.")
    own = entry.kind == "own_transfer"
    with db:
        db.execute("BEGIN IMMEDIATE")
        case = db.execute("SELECT kind FROM cases WHERE id=? AND status='approved'", (case_id,)).fetchone()
        if case is None:
            raise ValueError("Grupa nie istnieje lub została już rozwiązana.")
        if case["kind"] == "wallet_exchange":
            raise ValueError("Wymiany walut nie da się edytować.")
        for tid in entry.add:
            transaction_exists(db, tid)
        _require_cost_currency(_currencies(db, _member_ids(db, case_id) + entry.add), entry.currency)
        db.execute(
            """UPDATE cases SET kind=?, title=?, category_key=?, personal_amount=?, currency=?, booked_on=?
            WHERE id=?""",
            (
                entry.kind, entry.title, "transfer_own" if own else entry.category_key,
                "0" if own else str(entry.personal_amount), entry.currency, str(entry.booked_on), case_id,
            ),
        )
        for tid in entry.add:
            amount = Decimal(db.execute("SELECT amount FROM transactions WHERE id=?", (tid,)).fetchone()["amount"])
            db.execute(
                "INSERT INTO case_members(case_id, transaction_id, role) VALUES (?, ?, ?)",
                (case_id, tid, ledger.infer_case_member_role(entry.kind, amount)),
            )


def approve_group_extension(db: sqlite3.Connection, suggestion_id: int) -> None:
    row = db.execute(
        "SELECT payload_json FROM suggestions WHERE id=? AND kind='group_extension' AND status='suggested'",
        (suggestion_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Sugestia została już rozpatrzona.")
    payload = json.loads(row["payload_json"])
    ids = [int(i) for i in payload["transaction_ids"]]
    case = db.execute(
        "SELECT id, kind, title, category_key, booked_on FROM cases WHERE id=? AND status='approved'",
        (payload["case_id"],),
    ).fetchone()
    if case is None:
        raise ValueError("Grupa nie istnieje lub została już rozwiązana.")
    cost = suggested_group_cost(db, ids, case["id"])
    if cost["missing"]:
        # Without a rate the added amount would count as zero and understate the group.
        raise ValueError("Część transakcji nie ma kursu. Dopisz je ręcznie przez „Dodaj do grupy” i podaj koszt.")
    booked_on = case["booked_on"] or db.execute(
        "SELECT MIN(t.booking_date) AS day FROM case_members m JOIN transactions t ON t.id = m.transaction_id "
        "WHERE m.case_id=?",
        (case["id"],),
    ).fetchone()["day"]
    update_group(
        db,
        case["id"],
        GroupUpdate(
            title=case["title"],
            kind=case["kind"],
            personal_amount=-Decimal(cost["total"]),
            currency=cost["currency"],
            category_key=case["category_key"] or "uncategorized_expense",
            booked_on=booked_on,
            add=ids,
        ),
    )
    with db:
        db.execute(
            "UPDATE suggestions SET status='approved', decided_at=CURRENT_TIMESTAMP WHERE id=?", (suggestion_id,)
        )


def suggested_group_cost(db: sqlite3.Connection, transaction_ids: list[int], case_id: int | None) -> dict:
    from . import wallet_service

    in_pln = wallet_service.pln_equivalents(db) | cash_service.cash_state(db).values
    members = _member_ids(db, case_id) if case_id is not None else []
    case = (
        db.execute("SELECT personal_amount, currency FROM cases WHERE id=?", (case_id,)).fetchone() if members else None
    )
    currencies = _currencies(db, members + transaction_ids)
    if case is not None and case["currency"] != HOME_CURRENCY and currencies == {case["currency"]}:
        currency = case["currency"]
    else:
        currency = currencies.pop() if len(currencies) == 1 and case is None else HOME_CURRENCY
    total, missing = Decimal(0), 0
    if case is not None:
        # The group already states a real cost; additions are counted on top of it, not re-derived.
        cost = Decimal(case["personal_amount"])
        if case["currency"] != currency:
            rate = wallet_service.group_cost_rates(db, in_pln).get(case_id)
            if rate is None:
                missing += 1
            cost = cost * (rate or 0)
        total -= cost
    for tid in transaction_ids:
        row = db.execute("SELECT amount, currency FROM transactions WHERE id=?", (tid,)).fetchone()
        if row["currency"] == currency:
            total += Decimal(row["amount"])
        elif tid in in_pln:
            total += in_pln[tid]
        else:
            missing += 1
    return {"currency": currency, "total": str(total.quantize(Decimal("0.01"))), "missing": missing}


def ledger_blocks(
    db: sqlite3.Connection, query: str, direction: str, category: list[str], currency: list[str], limit: int,
    *, accounts: list[str] | None = None, date_from: date | None = None, date_to: date | None = None,
    unvalued: bool = False,
) -> dict:
    from . import wallet_service

    raw = ledger.transactions(db)
    cases = ledger.approved_cases(db)
    in_pln = wallet_service.pln_equivalents(db) | cash_service.cash_state(db).values

    foreign_cash = {
        row["transaction_id"]: (row["currency"], row["amount"])
        for row in db.execute("SELECT transaction_id, currency, amount FROM cash_foreign_withdrawals")
    }

    def item(row):
        return {
            "manual": row["transaction_type"] == ledger.MANUAL_ENTRY,
            "cash_currency": foreign_cash.get(row["id"], (None, None))[0],
            "cash_amount": foreign_cash.get(row["id"], (None, None))[1],
            # Absent when nothing can value this row honestly, so the UI can say so.
            "pln_amount": str(in_pln[row["id"]]) if row["id"] in in_pln else None,
            "id": row["id"],
            "bank_status": row["bank_status"],
            "date": row["booking_date"],
            "account": row["account"],
            "description": display_title(row),
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
                    "real_amount": "0" if row["category_key"] in OFF_BALANCE else row["amount"],
                    "off_balance": row["category_key"] in OFF_BALANCE,
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
                "case_kind": case["kind"],
                "counterparty": "",
                "amount": None,
                "real_amount": str(-Decimal(case["personal_amount"])),
                "valuation_missing": case.get("valuation_missing"),
                "from_statement": bool(case["from_statement"]),
                "currency": case["currency"],
                "category_key": case["category_key"],
                "category_label": case["category_label"] or "Do przypisania",
                "members": grouped[case["id"]],
            }
        )
    for index, item in enumerate(cash_service.spending_items(db)):
        amount = str(item["amount"] if item["kind"] == "income" else -item["amount"])
        blocks.append(
            {
                "key": f"cash{index}",
                "id": None,
                "case_id": None,
                "from_cash_count": True,
                "date": item["date"],
                "account": cash_service.CASH_ACCOUNT,
                "description": item["merchant"] if item["merchant"] != cash_service.CASH_ACCOUNT
                else "Wydatki z gotówki",
                "pln_amount": str(item["pln"]) if item.get("pln") is not None else None,
                "counterparty": "",
                "amount": amount,
                "real_amount": amount,
                "currency": item["currency"],
                "category_key": item["category"] if item["category"] != "uncategorized_expense" else None,
                "category_label": item["label"] if item["category"] != "uncategorized_expense" else "Bez kategorii",
                "members": [],
                "bank_status": None,
            }
        )
    needle = query.casefold()
    filtered = []
    for block in blocks:
        if direction == "expense" and not block.get("valuation_missing") and Decimal(block["real_amount"]) >= 0:
            continue
        if direction == "income" and not block.get("valuation_missing") and Decimal(block["real_amount"]) <= 0:
            continue
        if category and (block["category_key"] or "") not in category:
            continue
        # A mixed-currency group belongs to every currency one of its members was paid in.
        if currency and not any(r["currency"] in currency for r in [block, *block["members"]]):
            continue
        if accounts and not any(r["account"] in accounts for r in [block, *block["members"]]):
            continue
        if date_from and block["date"] < date_from.isoformat():
            continue
        if date_to and block["date"] > date_to.isoformat():
            continue
        if unvalued and not (
            block.get("valuation_missing")
            or (not block.get("off_balance") and block["currency"] != "PLN" and block.get("pln_amount") is None
                and not block["members"])
        ):
            continue
        if needle and not any(
            needle in f"{r['description']} {r['counterparty']}".casefold() for r in [block, *block["members"]]
        ):
            continue
        filtered.append(block)
    filtered.sort(key=lambda b: b["date"], reverse=True)
    return {
        "blocks": filtered[:limit],
        "total": len(filtered),
        "currencies": sorted({row["currency"] for row in raw}),
        "cases": cases,
    }


def account_coverage(db: sqlite3.Connection) -> list[dict]:
    rows = db.execute(
        f"""SELECT account, MIN(booking_date) AS first_date, MAX(booking_date) AS last_date,
                  COUNT(*) AS transactions
           FROM transactions
           WHERE transaction_type IS NOT NULL AND transaction_type NOT IN ({",".join("?" * len(ledger.APP_MADE_TYPES))})
           GROUP BY account ORDER BY last_date DESC, account""",
        ledger.APP_MADE_TYPES,
    ).fetchall()
    return [dict(row) for row in rows]


def relation_suggestions(db: sqlite3.Connection) -> list[dict]:
    suggestions = [s for s in ledger.pending_suggestions(db) if s["kind"] in ("relation", "group_extension")]
    for suggestion in suggestions:
        if suggestion["kind"] == "group_extension":
            payload = suggestion["payload"]
            before = suggested_group_cost(db, [], payload["case_id"])
            after = suggested_group_cost(db, [int(i) for i in payload["transaction_ids"]], payload["case_id"])
            same_currency = before["currency"] == after["currency"]
            suggestion["cost_before"] = str(-Decimal(before["total"])) if same_currency else None
            suggestion["cost_after"] = None if after["missing"] else str(-Decimal(after["total"]))
            suggestion["cost_currency"] = after["currency"]
    ids = {int(i) for s in suggestions for i in s["payload"]["transaction_ids"]}
    by_id = {
        row["id"]: row
        for row in db.execute(
            f"SELECT id, booking_date, amount, currency, description, merchant, counterparty FROM transactions "
            f"WHERE id IN ({','.join('?' * len(ids))})",
            tuple(ids),
        )
    } if ids else {}
    return [
        {
            **s,
            "members": [
                {
                    "id": row["id"],
                    "date": row["booking_date"],
                    "description": display_title(row),
                    "amount": row["amount"],
                    "currency": row["currency"],
                }
                for i in s["payload"]["transaction_ids"]
                if (row := by_id.get(int(i)))
            ],
        }
        for s in suggestions
    ]


def classification_rows(db: sqlite3.Connection) -> list[dict]:
    raw = ledger.transactions(db)
    by_id = {row["id"]: row for row in raw}
    suggestions = [s for s in ledger.pending_suggestions(db) if s["kind"] == "merchant_classification"]
    rejected = ledger.rejected_merchant_suggestion_transaction_ids(db, PROMPT_VERSION)
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
                "description": display_title(sample),
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
                "description": display_title(row),
                "date": row["booking_date"],
                "counterparty": visible_counterparty(row),
                "count": 1,
                "totals": {row["currency"]: row["amount"]},
                "category_key": None,
                "rationale": "",
                "confidence": None,
                "remember": False,
                "ai_rejected": row["id"] in rejected,
            }
        )
    return rows
