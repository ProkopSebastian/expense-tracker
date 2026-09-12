from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
import uuid
from contextlib import nullcontext
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal

from .database import insert_transaction
from .models import Transaction

_DOMAIN = re.compile(r"\b([a-z0-9-]+\.(?:pl|com|net|org|eu|shop|store|io))\b", re.IGNORECASE)

CaseKind = Literal["own_transfer", "shared_purchase", "reimbursement", "refund", "payment_dispute"]
CaseRole = Literal["purchase", "received_reimbursement", "paid_settlement", "received_refund", "account_transfer"]
DecisionSource = Literal["manual", "rule", "llm"]


def merchant_key(description: str) -> str:
    # An online/BLIK payment description is often mostly payment-processor and reference noise
    # (e.g. "WWW.VIVACUBA.PL|PAYPRO S.A. ... NUMER TRANSAKCJI BLIK: ...") that differs on every
    # transaction even for the same merchant. A domain name is a much stronger, stable identity
    # signal than the surrounding text, so prefer it outright when one is present.
    domain_match = _DOMAIN.search(description)
    if domain_match:
        return domain_match.group(1).casefold()
    value = unicodedata.normalize("NFKD", description)
    value = "".join(character for character in value if not unicodedata.combining(character))
    value = re.sub(r"\b(?:nr\s*karty|card)\b.*$", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\b\d+(?:[.,]\d+)?\s*pln\b", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\d+", " ", value)
    return " ".join(value.casefold().split())[:160]


def merchant_text(row: dict[str, object] | sqlite3.Row) -> str:
    return str(row["merchant"] or row["description"])


def merchant_rules(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute(
        """SELECT mr.id, mr.merchant_key, mr.category_key, c.label AS category_label, mr.created_at
        FROM merchant_rules mr JOIN categories c ON c.key = mr.category_key
        WHERE mr.is_active = 1 ORDER BY mr.created_at DESC, mr.id DESC"""
    ).fetchall()
    return [dict(row) for row in rows]


def delete_merchant_rule(connection: sqlite3.Connection, rule_id: int) -> None:
    connection.execute("UPDATE merchant_rules SET is_active = 0 WHERE id = ?", (rule_id,))
    connection.commit()


def update_merchant_rule(connection: sqlite3.Connection, rule_id: int, category_key: str) -> None:
    row = connection.execute("SELECT merchant_key FROM merchant_rules WHERE id = ?", (rule_id,)).fetchone()
    if row is None:
        raise ValueError("Reguła nie istnieje.")
    connection.execute("UPDATE merchant_rules SET category_key = ? WHERE id = ?", (category_key, rule_id))
    # Retroactively fix transactions this exact rule previously auto-classified (source='rule') —
    # but never touch a decision a human or the AI confirmed explicitly, that stays as chosen.
    connection.execute(
        """UPDATE transaction_decisions SET category_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE merchant_key = ? AND source = 'rule'""",
        (category_key, row["merchant_key"]),
    )
    connection.commit()


def pending_merchant_suggestion_transaction_ids(connection: sqlite3.Connection) -> set[int]:
    rows = connection.execute(
        "SELECT payload_json FROM suggestions WHERE kind = 'merchant_classification' AND status = 'suggested'"
    ).fetchall()
    ids: set[int] = set()
    for row in rows:
        payload = json.loads(row["payload_json"])
        ids.update(int(transaction_id) for transaction_id in payload["transaction_ids"])
    return ids


def pending_relation_suggestion_transaction_ids(connection: sqlite3.Connection) -> set[int]:
    rows = connection.execute(
        "SELECT payload_json FROM suggestions WHERE kind = 'relation' AND status = 'suggested'"
    ).fetchall()
    ids: set[int] = set()
    for row in rows:
        payload = json.loads(row["payload_json"])
        ids.update(int(transaction_id) for transaction_id in payload["transaction_ids"])
    return ids


def categories(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute("SELECT key, label, parent_key, kind FROM categories ORDER BY label").fetchall()
    return [dict(row) for row in rows]


def transactions(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute(
        """SELECT t.id, t.account, t.booking_date, t.amount, t.currency, t.description, t.merchant, t.counterparty,
                  t.transaction_type, t.bank_status, d.category_key, c.label AS category_label,
                  d.source AS decision_source,
                  d.status AS decision_status, d.confidence, d.explanation, cases.id AS case_id,
                  cases.title AS case_title, cases.status AS case_status
           FROM transactions t
           LEFT JOIN transaction_decisions d ON d.transaction_id = t.id
           LEFT JOIN categories c ON c.key = d.category_key
           LEFT JOIN case_members members ON members.transaction_id = t.id
           LEFT JOIN cases ON cases.id = members.case_id
           WHERE t.bank_status NOT IN ('DECLINED', 'REVERTED', 'FAILED')
           ORDER BY t.booking_date DESC, t.id DESC"""
    ).fetchall()
    return [dict(row) for row in rows]


def approved_cases(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute(
        """SELECT cases.id, cases.title, cases.category_key, categories.label AS category_label,
                  cases.personal_amount, cases.currency, MIN(transactions.booking_date) AS booking_date
           FROM cases
           JOIN case_members ON case_members.case_id = cases.id
           JOIN transactions ON transactions.id = case_members.transaction_id
           LEFT JOIN categories ON categories.key = cases.category_key
           WHERE cases.status = 'approved'
           GROUP BY cases.id
           ORDER BY booking_date DESC"""
    ).fetchall()
    return [dict(row) for row in rows]


def pending_suggestions(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute(
        """SELECT id, kind, payload_json, confidence, source, created_at
        FROM suggestions WHERE status = 'suggested' ORDER BY created_at DESC, id DESC"""
    ).fetchall()
    return [{**dict(row), "payload": json.loads(row["payload_json"])} for row in rows]


def approve_suggestion(connection: sqlite3.Connection, suggestion_id: int) -> None:
    row = connection.execute(
        "SELECT kind, payload_json FROM suggestions WHERE id = ? AND status = 'suggested'", (suggestion_id,)
    ).fetchone()
    if row is None:
        raise ValueError("Sugestia nie istnieje albo została już rozpatrzona.")
    payload = json.loads(row["payload_json"])
    with connection:
        if row["kind"] == "merchant_classification":
            transaction_ids = [int(transaction_id) for transaction_id in payload["transaction_ids"]]
            for transaction_id in transaction_ids:
                save_decision(
                    connection,
                    transaction_id,
                    payload["category_key"],
                    payload["rationale"],
                    source="llm",
                    commit=False,
                )
            if payload["should_create_rule"] and transaction_ids:
                save_merchant_rule(connection, transaction_ids[0], payload["category_key"], commit=False)
                apply_rules(connection, commit=False)
        elif row["kind"] == "relation":
            kind = payload["kind"]
            members = _validated_relation_members(connection, kind, payload["transaction_ids"], payload["currency"])
            personal_amount = Decimal(0) if kind == "own_transfer" else Decimal(str(payload["personal_amount"]))
            category_key = "transfer_own" if kind == "own_transfer" else payload["category_key"]
            create_case(
                connection,
                kind,
                payload["title"],
                category_key,
                personal_amount,
                payload["currency"],
                members,
                source="llm",
                explanation=payload.get("rationale"),
                commit=False,
            )
        else:
            raise ValueError("Nieznany rodzaj sugestii.")
        connection.execute(
            "UPDATE suggestions SET status = 'approved', decided_at = CURRENT_TIMESTAMP WHERE id = ?",
            (suggestion_id,),
        )


def _validated_relation_members(
    connection: sqlite3.Connection, kind: CaseKind, raw_ids: list[int], currency: str
) -> list[tuple[int, CaseRole]]:
    transaction_ids = [int(transaction_id) for transaction_id in raw_ids]
    if len(transaction_ids) < 2 or len(transaction_ids) != len(set(transaction_ids)):
        raise ValueError("Grupa musi zawierać co najmniej dwie różne transakcje.")
    placeholders = ",".join("?" for _ in transaction_ids)
    rows = connection.execute(
        f"""SELECT t.id, t.amount, t.currency, members.case_id
        FROM transactions t LEFT JOIN case_members members ON members.transaction_id = t.id
        WHERE t.id IN ({placeholders})""",
        transaction_ids,
    ).fetchall()
    if len(rows) != len(transaction_ids):
        raise ValueError("Jedna z transakcji już nie istnieje.")
    if any(row["case_id"] is not None for row in rows):
        raise ValueError("Jedna z transakcji należy już do innej grupy.")
    if any(row["currency"] != currency for row in rows):
        raise ValueError("Wszystkie transakcje w grupie muszą mieć tę samą walutę.")
    by_id = {int(row["id"]): row for row in rows}
    return [
        (transaction_id, infer_case_member_role(kind, Decimal(str(by_id[transaction_id]["amount"]))))
        for transaction_id in transaction_ids
    ]


def reject_suggestion(connection: sqlite3.Connection, suggestion_id: int) -> None:
    connection.execute(
        "UPDATE suggestions SET status = 'rejected', decided_at = CURRENT_TIMESTAMP WHERE id = ?", (suggestion_id,)
    )
    connection.commit()


def save_decision(
    connection: sqlite3.Connection,
    transaction_id: int,
    category_key: str,
    explanation: str = "Ręcznie zatwierdzone w dashboardzie",
    source: DecisionSource = "manual",
    *,
    commit: bool = True,
) -> None:
    row = connection.execute(
        "SELECT description, merchant FROM transactions WHERE id = ?", (transaction_id,)
    ).fetchone()
    if row is None:
        raise ValueError("Transakcja nie istnieje.")
    connection.execute(
        """INSERT INTO transaction_decisions
        (transaction_id, category_key, source, status, confidence, explanation, merchant_key)
        VALUES (?, ?, ?, 'approved', 1, ?, ?)
        ON CONFLICT(transaction_id) DO UPDATE SET category_key = excluded.category_key,
            source = excluded.source, status = excluded.status, confidence = excluded.confidence,
            explanation = excluded.explanation, merchant_key = excluded.merchant_key,
            updated_at = CURRENT_TIMESTAMP""",
        (transaction_id, category_key, source, explanation, merchant_key(merchant_text(row))),
    )
    if commit:
        connection.commit()


def save_merchant_rule(
    connection: sqlite3.Connection, transaction_id: int, category_key: str, *, commit: bool = True
) -> None:
    row = connection.execute(
        "SELECT description, merchant FROM transactions WHERE id = ?", (transaction_id,)
    ).fetchone()
    if row is None:
        raise ValueError("Transakcja nie istnieje.")
    connection.execute(
        """INSERT INTO merchant_rules(merchant_key, category_key)
        VALUES (?, ?)
        ON CONFLICT(merchant_key) DO UPDATE SET category_key = excluded.category_key, is_active = 1""",
        (merchant_key(merchant_text(row)), category_key),
    )
    if commit:
        connection.commit()


def apply_rules(connection: sqlite3.Connection, *, commit: bool = True) -> int:
    rules = connection.execute(
        "SELECT merchant_key, category_key FROM merchant_rules WHERE is_active = 1 ORDER BY priority"
    ).fetchall()
    rows = connection.execute(
        """SELECT id, description, merchant FROM transactions
        WHERE id NOT IN (SELECT transaction_id FROM transaction_decisions)"""
    ).fetchall()
    applied = 0
    rule_map = {rule["merchant_key"]: rule["category_key"] for rule in rules}
    for row in rows:
        key = merchant_key(merchant_text(row))
        category_key = rule_map.get(key)
        if category_key is None:
            continue
        connection.execute(
            """INSERT INTO transaction_decisions
            (transaction_id, category_key, source, status, confidence, explanation, merchant_key)
            VALUES (?, ?, 'rule', 'approved', 1, 'Dopasowano lokalną regułę merchanta', ?)""",
            (row["id"], category_key, key),
        )
        applied += 1
    if commit:
        connection.commit()
    return applied


def create_case(
    connection: sqlite3.Connection,
    kind: CaseKind,
    title: str,
    category_key: str | None,
    personal_amount: Decimal,
    currency: str,
    members: list[tuple[int, CaseRole]],
    *,
    source: DecisionSource = "manual",
    explanation: str | None = None,
    commit: bool = True,
) -> int:
    with connection if commit else nullcontext():
        cursor = connection.execute(
            """INSERT INTO cases(kind, title, category_key, personal_amount, currency, status, source, explanation)
            VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)""",
            (kind, title, category_key, str(personal_amount), currency, source, explanation),
        )
        case_id = int(cursor.lastrowid)
        connection.executemany(
            "INSERT INTO case_members(case_id, transaction_id, role) VALUES (?, ?, ?)",
            [(case_id, transaction_id, role) for transaction_id, role in members],
        )
    return case_id


def dissolve_case(connection: sqlite3.Connection, case_id: int) -> None:
    connection.execute("DELETE FROM case_members WHERE case_id = ?", (case_id,))
    connection.execute("UPDATE cases SET status = 'rejected' WHERE id = ?", (case_id,))
    connection.commit()


def infer_case_member_role(kind: CaseKind, amount: Decimal) -> CaseRole:
    if kind == "own_transfer":
        return "account_transfer"
    if kind == "refund":
        return "received_refund" if amount > 0 else "purchase"
    if kind == "shared_purchase":
        return "received_reimbursement" if amount > 0 else "purchase"
    if kind == "reimbursement":
        return "paid_settlement" if amount < 0 else "received_reimbursement"
    return "purchase"


def add_manual_transaction(
    connection: sqlite3.Connection,
    *,
    account: str,
    booking_date: date,
    amount: Decimal,
    currency: str,
    description: str,
    counterparty: str | None,
    category_key: str,
) -> int:
    transaction = Transaction(
        account=account,
        booking_date=booking_date,
        amount=amount,
        currency=currency,
        description=description,
        counterparty=counterparty,
        external_id=uuid.uuid4().hex,
        raw={"Type": "manual_entry", "entered_at": datetime.now(UTC).isoformat()},
    )
    with connection:
        transaction_id = insert_transaction(connection, transaction, commit=False)
        if transaction_id is None:
            raise ValueError("Nie udało się dodać ręcznego wpisu.")
        save_decision(connection, transaction_id, category_key, "Wpisane ręcznie w aplikacji", commit=False)
    return transaction_id


def approve_merchant_suggestion_with_category(
    connection: sqlite3.Connection, suggestion_id: int, category_key: str, should_create_rule: bool
) -> None:
    row = connection.execute(
        """SELECT payload_json FROM suggestions
        WHERE id = ? AND kind = 'merchant_classification' AND status = 'suggested'""",
        (suggestion_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Sugestia nie istnieje.")
    payload = json.loads(row["payload_json"])
    transaction_ids = [int(transaction_id) for transaction_id in payload["transaction_ids"]]
    with connection:
        if not connection.in_transaction:
            connection.execute("BEGIN IMMEDIATE")
        # A suggestion is valid only while its input is still unclassified and ungrouped.
        for transaction_id in transaction_ids:
            if (
                connection.execute(
                    "SELECT 1 FROM transaction_decisions WHERE transaction_id=?", (transaction_id,)
                ).fetchone()
                or connection.execute(
                    "SELECT 1 FROM case_members cm JOIN cases c ON c.id=cm.case_id "
                    "WHERE cm.transaction_id=? AND c.status='approved'",
                    (transaction_id,),
                ).fetchone()
            ):
                raise ValueError("Dane sugestii zmieniły się. Odrzuć starą sugestię i odśwież widok.")
        for transaction_id in transaction_ids:
            save_decision(
                connection,
                transaction_id,
                category_key,
                payload.get("rationale", "Sugestia AI"),
                source="llm",
                commit=False,
            )
        if should_create_rule and transaction_ids:
            save_merchant_rule(connection, transaction_ids[0], category_key, commit=False)
            apply_rules(connection, commit=False)
        connection.execute(
            "UPDATE suggestions SET status = 'approved', decided_at = CURRENT_TIMESTAMP WHERE id = ?",
            (suggestion_id,),
        )
