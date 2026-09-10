from __future__ import annotations

from datetime import date
from decimal import Decimal

from expense_tracker.database import Database
from expense_tracker.ledger import approved_cases, create_case, save_decision, transactions
from expense_tracker.ledger_view import build_rows
from expense_tracker.models import Transaction


def _transaction(amount: str, description: str, day: int = 10) -> Transaction:
    return Transaction(
        account="nest", booking_date=date(2026, 9, day), amount=Decimal(amount), currency="PLN", description=description
    )


def test_case_members_are_grouped_adjacently_with_summary_row(database: Database) -> None:
    database.insert_transactions([_transaction("-800", "Lot tam"), _transaction("-50", "Wyrównanie")])
    rows = transactions(database.connection)
    create_case(
        database.connection,
        "shared_purchase",
        "Loty z Anią",
        "travel_flights",
        Decimal("850"),
        "PLN",
        [(int(row["id"]), "purchase") for row in rows],
    )

    built = build_rows(transactions(database.connection), approved_cases(database.connection))

    assert [row["Sprawa"] for row in built] == ["Loty z Anią"] * 3
    assert built[0]["id"] is None
    assert built[0]["_kind"] == "case_summary"
    assert built[0]["Kwota rzeczywista"] == -850.0
    assert built[1]["Opis"].startswith("↳ ")
    assert built[2]["Opis"].startswith("↳ ")
    assert built[1]["_kind"] == "case_member"


def test_transfer_own_shows_zero_real_amount(database: Database) -> None:
    database.insert_transactions([_transaction("-500", "Zasilenie Revolut")])
    row = transactions(database.connection)[0]
    save_decision(database.connection, int(row["id"]), "transfer_own")

    built = build_rows(transactions(database.connection), approved_cases(database.connection))

    assert built[0]["Kwota"] == -500.0
    assert built[0]["Kwota rzeczywista"] == 0.0
