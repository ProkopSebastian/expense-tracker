from __future__ import annotations

from datetime import date
from decimal import Decimal

from expense_tracker.database import Database
from expense_tracker.ledger import add_manual_transaction, transactions


def test_add_manual_transaction_creates_transaction_and_decision(database: Database) -> None:
    transaction_id = add_manual_transaction(
        database.connection,
        account="Gotówka",
        booking_date=date(2026, 9, 10),
        amount=Decimal("-25"),
        currency="PLN",
        description="Bilet autobusowy",
        counterparty=None,
        category_key="transport",
    )

    row = next(row for row in transactions(database.connection) if row["id"] == transaction_id)
    assert row["transaction_type"] == "manual_entry"
    assert row["category_key"] == "transport"
    assert row["decision_source"] == "manual"


def test_two_manual_entries_with_identical_fields_do_not_collide(database: Database) -> None:
    kwargs = {
        "account": "Gotówka",
        "booking_date": date(2026, 9, 10),
        "amount": Decimal("-10"),
        "currency": "PLN",
        "description": "Kawa",
        "counterparty": None,
        "category_key": "food_restaurants",
    }

    first_id = add_manual_transaction(database.connection, **kwargs)
    second_id = add_manual_transaction(database.connection, **kwargs)

    assert first_id != second_id
    assert database.connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 2
