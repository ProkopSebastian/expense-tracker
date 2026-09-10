from __future__ import annotations

import sqlite3

from .ledger import approved_cases, categories, pending_suggestions, transactions
from .ledger_view import build_rows
from .reporting import actuals, by_category, category_breakdown, summary


def snapshot(connection: sqlite3.Connection) -> dict[str, object]:
    rows = transactions(connection)
    cases = approved_cases(connection)
    category_rows = categories(connection)
    items = actuals(rows, cases)
    return {
        "transactions": rows,
        "categories": category_rows,
        "cases": cases,
        "suggestions": pending_suggestions(connection),
        "items": items,
        "summary": summary(items),
        "by_category": by_category(items),
        "category_breakdown": category_breakdown(items, category_rows),
        "ledger_rows": build_rows(rows, cases),
    }
