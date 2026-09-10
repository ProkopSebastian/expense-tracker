from __future__ import annotations

from datetime import date
from decimal import Decimal

from expense_tracker.database import Database
from expense_tracker.ledger import (
    approve_merchant_suggestion_with_category,
    create_case,
    delete_merchant_rule,
    dissolve_case,
    merchant_rules,
    save_decision,
    save_merchant_rule,
    transactions,
)
from expense_tracker.models import Transaction


def _insert_suggestion(database: Database, transaction_id: int, category_key: str) -> int:
    import json

    payload = {
        "transaction_ids": [transaction_id],
        "category_key": category_key,
        "confidence": 0.4,
        "rationale": "AI guess",
        "should_create_rule": True,
    }
    cursor = database.connection.execute(
        """INSERT INTO suggestions (fingerprint, kind, payload_json, confidence, source, status)
        VALUES (?, 'merchant_classification', ?, 0.4, 'llm', 'suggested')""",
        (f"fp-{transaction_id}", json.dumps(payload)),
    )
    database.connection.commit()
    return int(cursor.lastrowid)


def test_approving_with_edited_category_overrides_the_ai_suggestion(database: Database) -> None:
    database.insert_transactions(
        [
            Transaction(
                account="nest",
                booking_date=date(2026, 9, 1),
                amount=Decimal("-40"),
                currency="PLN",
                description="MR.ROLLO WARSZAWA",
            )
        ]
    )
    transaction_id = int(transactions(database.connection)[0]["id"])
    # AI suggested the wrong category ("shopping"); the user corrects it to "food_restaurants" before approving.
    suggestion_id = _insert_suggestion(database, transaction_id, "shopping")

    approve_merchant_suggestion_with_category(database.connection, suggestion_id, "food_restaurants", True)

    row = transactions(database.connection)[0]
    assert row["category_key"] == "food_restaurants"
    status = database.connection.execute("SELECT status FROM suggestions WHERE id = ?", (suggestion_id,)).fetchone()
    assert status["status"] == "approved"
    rule = database.connection.execute("SELECT category_key FROM merchant_rules").fetchone()
    assert rule["category_key"] == "food_restaurants"


def test_dissolve_case_releases_members_back_to_the_ledger(database: Database) -> None:
    database.insert_transactions(
        [
            Transaction(
                account="nest", booking_date=date(2026, 9, 1), amount=Decimal("-800"), currency="PLN", description="Lot"
            ),
            Transaction(
                account="nest",
                booking_date=date(2026, 9, 1),
                amount=Decimal("-50"),
                currency="PLN",
                description="Wyrównanie",
            ),
        ]
    )
    rows = transactions(database.connection)
    case_id = create_case(
        database.connection,
        "shared_purchase",
        "Loty",
        "travel_flights",
        Decimal("850"),
        "PLN",
        [(int(row["id"]), "purchase") for row in rows],
    )

    dissolve_case(database.connection, case_id)

    rows_after = transactions(database.connection)
    assert all(row["case_id"] is None for row in rows_after)
    status = database.connection.execute("SELECT status FROM cases WHERE id = ?", (case_id,)).fetchone()
    assert status["status"] == "rejected"


def test_merchant_rules_can_be_listed_and_deleted(database: Database) -> None:
    database.insert_transactions(
        [
            Transaction(
                account="nest",
                booking_date=date(2026, 9, 1),
                amount=Decimal("-30"),
                currency="PLN",
                description="Zabka",
            )
        ]
    )
    transaction_id = int(transactions(database.connection)[0]["id"])
    save_decision(database.connection, transaction_id, "groceries")
    save_merchant_rule(database.connection, transaction_id, "groceries")

    rules = merchant_rules(database.connection)
    assert len(rules) == 1
    assert rules[0]["category_label"] == "Zakupy spożywcze"

    delete_merchant_rule(database.connection, int(rules[0]["id"]))

    assert merchant_rules(database.connection) == []
