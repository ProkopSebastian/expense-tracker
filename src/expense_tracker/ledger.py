from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from .database import insert_transaction
from .models import Transaction


def merchant_key(description: str) -> str:
    value = unicodedata.normalize("NFKD", description)
    value = "".join(character for character in value if not unicodedata.combining(character))
    value = re.sub(r"\b(?:nr\s*karty|card)\b.*$", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\b\d+(?:[.,]\d+)?\s*pln\b", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\d+", " ", value)
    return " ".join(value.casefold().split())[:160]


def merchant_rules(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute(
        """SELECT mr.id, mr.merchant_key, mr.category_key, c.label AS category_label, mr.created_at
        FROM merchant_rules mr JOIN categories c ON c.key = mr.category_key
        WHERE mr.is_active = 1 ORDER BY mr.created_at DESC"""
    ).fetchall()
    return [dict(row) for row in rows]


def delete_merchant_rule(connection: sqlite3.Connection, rule_id: int) -> None:
    connection.execute("UPDATE merchant_rules SET is_active = 0 WHERE id = ?", (rule_id,))
    connection.commit()


def categories(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute("SELECT key, label, parent_key, kind FROM categories ORDER BY label").fetchall()
    return [dict(row) for row in rows]


def transactions(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute(
        """SELECT t.id, t.account, t.booking_date, t.amount, t.currency, t.description, t.counterparty,
                  t.transaction_type, d.category_key, c.label AS category_label, d.source AS decision_source,
                  d.status AS decision_status, d.confidence, d.explanation, cases.id AS case_id,
                  cases.title AS case_title, cases.status AS case_status
           FROM transactions t
           LEFT JOIN transaction_decisions d ON d.transaction_id = t.id
           LEFT JOIN categories c ON c.key = d.category_key
           LEFT JOIN case_members members ON members.transaction_id = t.id
           LEFT JOIN cases ON cases.id = members.case_id
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
    row = connection.execute("SELECT kind, payload_json FROM suggestions WHERE id = ?", (suggestion_id,)).fetchone()
    if row is None:
        raise ValueError("Sugestia nie istnieje.")
    payload = json.loads(row["payload_json"])
    if row["kind"] == "merchant_classification":
        transaction_ids = [int(transaction_id) for transaction_id in payload["transaction_ids"]]
        for transaction_id in transaction_ids:
            save_decision(connection, transaction_id, payload["category_key"], payload["rationale"])
        if payload["should_create_rule"] and transaction_ids:
            save_merchant_rule(connection, transaction_ids[0], payload["category_key"])
            apply_rules(connection)
    elif row["kind"] == "relation":
        create_case(
            connection,
            payload["kind"],
            payload["title"],
            payload["category_key"],
            Decimal(str(payload["personal_amount"])),
            payload["currency"],
            [(int(transaction_id), "purchase") for transaction_id in payload["transaction_ids"]],
        )
    else:
        raise ValueError("Nieznany rodzaj sugestii.")
    connection.execute(
        "UPDATE suggestions SET status = 'approved', decided_at = CURRENT_TIMESTAMP WHERE id = ?", (suggestion_id,)
    )
    connection.commit()


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
) -> None:
    row = connection.execute("SELECT description FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
    if row is None:
        raise ValueError("Transakcja nie istnieje.")
    connection.execute(
        """INSERT INTO transaction_decisions
        (transaction_id, category_key, source, status, confidence, explanation, merchant_key)
        VALUES (?, ?, 'manual', 'approved', 1, ?, ?)
        ON CONFLICT(transaction_id) DO UPDATE SET category_key = excluded.category_key,
            source = excluded.source, status = excluded.status, confidence = excluded.confidence,
            explanation = excluded.explanation, merchant_key = excluded.merchant_key,
            updated_at = CURRENT_TIMESTAMP""",
        (transaction_id, category_key, explanation, merchant_key(row["description"])),
    )
    connection.commit()


def save_merchant_rule(connection: sqlite3.Connection, transaction_id: int, category_key: str) -> None:
    row = connection.execute("SELECT description FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
    if row is None:
        raise ValueError("Transakcja nie istnieje.")
    connection.execute(
        """INSERT INTO merchant_rules(merchant_key, category_key)
        VALUES (?, ?)
        ON CONFLICT(merchant_key) DO UPDATE SET category_key = excluded.category_key, is_active = 1""",
        (merchant_key(row["description"]), category_key),
    )
    connection.commit()


def apply_rules(connection: sqlite3.Connection) -> int:
    rules = connection.execute(
        "SELECT merchant_key, category_key FROM merchant_rules WHERE is_active = 1 ORDER BY priority"
    ).fetchall()
    rows = connection.execute(
        "SELECT id, description FROM transactions WHERE id NOT IN (SELECT transaction_id FROM transaction_decisions)"
    ).fetchall()
    applied = 0
    rule_map = {rule["merchant_key"]: rule["category_key"] for rule in rules}
    for row in rows:
        key = merchant_key(row["description"])
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
    connection.commit()
    return applied


def create_case(
    connection: sqlite3.Connection,
    kind: str,
    title: str,
    category_key: str | None,
    personal_amount: Decimal,
    currency: str,
    members: list[tuple[int, str]],
) -> int:
    cursor = connection.execute(
        """INSERT INTO cases(kind, title, category_key, personal_amount, currency, status, source)
        VALUES (?, ?, ?, ?, ?, 'approved', 'manual')""",
        (kind, title, category_key, str(personal_amount), currency),
    )
    case_id = int(cursor.lastrowid)
    connection.executemany(
        "INSERT INTO case_members(case_id, transaction_id, role) VALUES (?, ?, ?)",
        [(case_id, transaction_id, role) for transaction_id, role in members],
    )
    connection.commit()
    return case_id


def dissolve_case(connection: sqlite3.Connection, case_id: int) -> None:
    connection.execute("DELETE FROM case_members WHERE case_id = ?", (case_id,))
    connection.execute("UPDATE cases SET status = 'rejected' WHERE id = ?", (case_id,))
    connection.commit()


def infer_case_member_role(kind: str, amount: Decimal) -> str:
    if kind == "own_transfer":
        return "account_transfer"
    if kind == "refund":
        return "received_refund" if amount > 0 else "purchase"
    if kind in ("shared_purchase", "reimbursement"):
        return "received_reimbursement" if amount > 0 else "purchase"
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
    transaction_id = insert_transaction(connection, transaction)
    if transaction_id is None:
        raise ValueError("Nie udało się dodać ręcznego wpisu.")
    save_decision(connection, transaction_id, category_key, "Wpisane ręcznie w aplikacji")
    return transaction_id


def approve_merchant_suggestion_with_category(
    connection: sqlite3.Connection, suggestion_id: int, category_key: str, should_create_rule: bool
) -> None:
    row = connection.execute(
        "SELECT payload_json FROM suggestions WHERE id = ? AND kind = 'merchant_classification'", (suggestion_id,)
    ).fetchone()
    if row is None:
        raise ValueError("Sugestia nie istnieje.")
    payload = json.loads(row["payload_json"])
    transaction_ids = [int(transaction_id) for transaction_id in payload["transaction_ids"]]
    for transaction_id in transaction_ids:
        save_decision(connection, transaction_id, category_key, payload.get("rationale", "Sugestia AI"))
    if should_create_rule and transaction_ids:
        save_merchant_rule(connection, transaction_ids[0], category_key)
        apply_rules(connection)
    connection.execute(
        "UPDATE suggestions SET status = 'approved', decided_at = CURRENT_TIMESTAMP WHERE id = ?", (suggestion_id,)
    )
    connection.commit()
