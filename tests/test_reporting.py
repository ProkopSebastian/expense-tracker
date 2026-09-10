from datetime import date
from decimal import Decimal

from expense_tracker.database import Database
from expense_tracker.ledger import approved_cases, categories, create_case, save_decision, transactions
from expense_tracker.models import Transaction
from expense_tracker.reporting import actuals, category_breakdown, summary


def transaction(amount: str, description: str) -> Transaction:
    return Transaction(
        account="nest",
        booking_date=date(2026, 9, 10),
        amount=Decimal(amount),
        currency="PLN",
        description=description,
    )


def test_shared_purchase_uses_personal_cost_not_bank_movements(tmp_path) -> None:
    database = Database(tmp_path / "expenses.sqlite3")
    try:
        database.insert_transactions([transaction("-90", "Pizza"), transaction("60", "BLIK za pizzę")])
        rows = transactions(database.connection)
        create_case(
            database.connection,
            "shared_purchase",
            "Pizza ze znajomymi",
            "food_restaurants",
            Decimal("30"),
            "PLN",
            [(int(row["id"]), "purchase") for row in rows],
        )
        items = actuals(transactions(database.connection), approved_cases(database.connection))
    finally:
        database.close()

    assert summary(items) == {"expenses": Decimal("30"), "income": Decimal(), "balance": Decimal("-30")}


def test_approved_own_transfer_is_not_an_expense(tmp_path) -> None:
    database = Database(tmp_path / "expenses.sqlite3")
    try:
        database.insert_transactions([transaction("-500", "Zasilenie Revolut")])
        row = transactions(database.connection)[0]
        save_decision(database.connection, int(row["id"]), "transfer_own")
        items = actuals(transactions(database.connection), approved_cases(database.connection))
    finally:
        database.close()

    assert summary(items) == {"expenses": Decimal(), "income": Decimal(), "balance": Decimal()}


def test_category_breakdown_groups_children_under_parent(database: Database) -> None:
    database.insert_transactions(
        [transaction("-30", "Restauracja"), transaction("-20", "Biedronka"), transaction("-15", "Kino")]
    )
    rows = {str(row["description"]): row for row in transactions(database.connection)}
    save_decision(database.connection, int(rows["Restauracja"]["id"]), "food_restaurants")
    save_decision(database.connection, int(rows["Biedronka"]["id"]), "groceries")
    save_decision(database.connection, int(rows["Kino"]["id"]), "entertainment")

    items = actuals(transactions(database.connection), approved_cases(database.connection))
    breakdown = category_breakdown(items, categories(database.connection))

    assert breakdown["food"]["total"] == Decimal("50")
    assert breakdown["food"]["children"]["food_restaurants"]["total"] == Decimal("30")
    assert breakdown["food"]["children"]["groceries"]["total"] == Decimal("20")
    assert breakdown["entertainment"]["total"] == Decimal("15")
    assert breakdown["entertainment"]["children"]["entertainment__other"]["total"] == Decimal("15")


def test_category_breakdown_only_counts_expenses() -> None:
    items = [{"date": "2026-09-10", "amount": Decimal("100"), "kind": "income", "category": "income", "label": "x"}]
    assert category_breakdown(items, []) == {}


def test_category_breakdown_groups_third_level_by_merchant(database: Database) -> None:
    database.insert_transactions(
        [transaction("-20", "Biedronka 123"), transaction("-15", "ZABKA nr 42"), transaction("-10", "Biedronka 456")]
    )
    for row in transactions(database.connection):
        save_decision(database.connection, int(row["id"]), "groceries")

    items = actuals(transactions(database.connection), approved_cases(database.connection))
    merchants = category_breakdown(items, categories(database.connection))["food"]["children"]["groceries"]["children"]

    assert merchants["Biedronka"]["total"] == Decimal("30")
    assert merchants["Zabka Nr"]["total"] == Decimal("15")
