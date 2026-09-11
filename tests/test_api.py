from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from expense_tracker.api import create_app
from expense_tracker.database import Database
from expense_tracker.ledger import create_case, save_decision
from expense_tracker.models import Transaction


def test_summary_keeps_group_costs_currency_and_decimal_precision(tmp_path):
    path = tmp_path / "api.sqlite3"
    db = Database(path)
    purchase = db.insert_transaction(
        Transaction(
            account="test",
            booking_date=date(2026, 9, 10),
            amount=Decimal("-90"),
            currency="PLN",
            description="Pizza",
        )
    )
    refund = db.insert_transaction(
        Transaction(
            account="test",
            booking_date=date(2026, 9, 10),
            amount=Decimal("60"),
            currency="PLN",
            description="Rozliczenie",
        )
    )
    create_case(
        db.connection,
        "shared_purchase",
        "Pizza razem",
        "food_restaurants",
        Decimal("30.01"),
        "PLN",
        [(purchase, "purchase"), (refund, "received_reimbursement")],
    )
    euro = db.insert_transaction(
        Transaction(
            account="test",
            booking_date=date(2026, 9, 10),
            amount=Decimal("-500"),
            currency="EUR",
            description="Euro",
        )
    )
    save_decision(db.connection, euro, "groceries")
    db.close()
    with TestClient(create_app(path)) as client:
        response = client.get("/api/summary")
        assert response.status_code == 200
        body = response.json()
        assert body["expenses"] == "30.01"
        assert body["income"] == "0"
        assert body["item_count"] == 1
        assert body["breakdown"][0]["children"][0]["children"][0]["total"] == "30.01"
        assert client.get("/api/summary?currency=EUR").json()["expenses"] == "500"
        assert client.get("/api/summary?month=2026-08").json()["expenses"] == "0"


def test_api_handles_empty_database_and_invalid_filters(tmp_path):
    with TestClient(create_app(tmp_path / "empty.sqlite3")) as client:
        response = client.get("/api/summary")
        assert response.status_code == 200
        assert response.json()["breakdown"] == []
        assert response.json()["start"] is None
        for query in ["mode=invalid", "month=2026-13", "mode=custom", "mode=custom&start=2026-09-10&end=2026-09-01"]:
            assert client.get(f"/api/summary?{query}").status_code == 422


def test_periods_anchor_on_latest_available_transaction(tmp_path):
    path = tmp_path / "periods.sqlite3"
    db = Database(path)
    for day in [date(2025, 1, 1), date(2026, 7, 31), date(2026, 8, 31), date(2026, 9, 10)]:
        db.insert_transaction(
            Transaction(
                account="test",
                booking_date=day,
                amount=Decimal("-10"),
                currency="PLN",
                description=str(day),
            )
        )
    db.close()
    with TestClient(create_app(path)) as client:
        for mode, start, expected in [
            ("30days", "2026-08-12", "20"),
            ("3months", "2026-07-01", "30"),
            ("year", "2026-01-01", "30"),
        ]:
            body = client.get(f"/api/summary?mode={mode}").json()
            assert body["start"] == start
            assert body["end"] == "2026-09-10"
            assert body["expenses"] == expected
        body = client.get("/api/summary?mode=custom&start=2026-08-31&end=2026-08-31").json()
        assert body["expenses"] == "10"
