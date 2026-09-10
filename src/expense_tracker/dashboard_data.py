from __future__ import annotations

import sqlite3
from typing import TypedDict

from .ledger import approved_cases, categories, pending_suggestions, transactions
from .ledger_view import build_rows
from .reporting import actuals

Row = dict[str, object]


class SummaryData(TypedDict):
    items: list[Row]
    categories: list[Row]


class LedgerData(TypedDict):
    categories: list[Row]
    cases: list[Row]
    suggestions: list[Row]
    ledger_rows: list[Row]


class ClassificationData(TypedDict):
    transactions: list[Row]
    categories: list[Row]
    suggestions: list[Row]


class RulesData(TypedDict):
    categories: list[Row]


def has_transactions(connection: sqlite3.Connection) -> bool:
    return connection.execute("SELECT EXISTS(SELECT 1 FROM transactions LIMIT 1)").fetchone()[0] == 1


def summary_data(connection: sqlite3.Connection) -> SummaryData:
    rows = transactions(connection)
    case_rows = approved_cases(connection)
    category_rows = categories(connection)
    return {"items": actuals(rows, case_rows), "categories": category_rows}


def ledger_data(connection: sqlite3.Connection) -> LedgerData:
    rows = transactions(connection)
    case_rows = approved_cases(connection)
    return {
        "categories": categories(connection),
        "cases": case_rows,
        "suggestions": pending_suggestions(connection),
        "ledger_rows": build_rows(rows, case_rows),
    }


def classification_data(connection: sqlite3.Connection) -> ClassificationData:
    return {
        "transactions": transactions(connection),
        "categories": categories(connection),
        "suggestions": pending_suggestions(connection),
    }


def rules_data(connection: sqlite3.Connection) -> RulesData:
    return {"categories": categories(connection)}
