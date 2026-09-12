from __future__ import annotations

from datetime import date
from decimal import Decimal

from expense_tracker.database import Database
from expense_tracker.ledger import (
    apply_rules,
    approve_merchant_suggestion_with_category,
    create_case,
    delete_merchant_rule,
    dissolve_case,
    merchant_rules,
    save_decision,
    save_merchant_rule,
    transactions,
    update_merchant_rule,
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
    assert row["decision_source"] == "llm"
    status = database.connection.execute("SELECT status FROM suggestions WHERE id = ?", (suggestion_id,)).fetchone()
    assert status["status"] == "approved"
    rule = database.connection.execute("SELECT category_key FROM merchant_rules").fetchone()
    assert rule["category_key"] == "food_restaurants"


def test_merchant_rule_uses_normalized_merchant_instead_of_bank_description(database: Database) -> None:
    database.insert_transactions(
        [
            Transaction(
                account="velo",
                booking_date=date(2026, 9, 1),
                amount=Decimal("-20"),
                currency="PLN",
                description="Operacja kartą z bankowym numerem 111",
                merchant="TEST SHOP",
            ),
            Transaction(
                account="velo",
                booking_date=date(2026, 9, 2),
                amount=Decimal("-30"),
                currency="PLN",
                description="Operacja kartą z innym numerem 222",
                merchant="TEST SHOP",
            ),
        ]
    )
    rows = transactions(database.connection)
    classified_id = int(rows[-1]["id"])
    save_decision(database.connection, classified_id, "shopping")
    save_merchant_rule(database.connection, classified_id, "shopping")

    assert apply_rules(database.connection) == 1
    categories = {int(row["id"]): row["category_key"] for row in transactions(database.connection)}
    assert set(categories.values()) == {"shopping"}


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


def test_updating_a_rule_retroactively_fixes_rule_classified_transactions(database: Database) -> None:
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
    manual_id = int(transactions(database.connection)[0]["id"])
    # A manual decision made before the rule existed — untouched by apply_rules and must survive
    # the retroactive fix below, even though its category happens to match the rule's old value.
    save_decision(database.connection, manual_id, "shopping")
    save_merchant_rule(database.connection, manual_id, "shopping")

    database.insert_transactions(
        [
            Transaction(
                account="nest",
                booking_date=date(2026, 9, 2),
                amount=Decimal("-20"),
                currency="PLN",
                description="Zabka",
            )
        ]
    )
    rule_classified_id = next(int(row["id"]) for row in transactions(database.connection) if row["id"] != manual_id)
    apply_rules(database.connection)
    rows = {int(row["id"]): row for row in transactions(database.connection)}
    assert rows[rule_classified_id]["decision_source"] == "rule"

    rule_id = int(merchant_rules(database.connection)[0]["id"])
    update_merchant_rule(database.connection, rule_id, "groceries")

    rows = {int(row["id"]): row for row in transactions(database.connection)}
    assert rows[rule_classified_id]["category_key"] == "groceries"
    assert rows[manual_id]["category_key"] == "shopping"
