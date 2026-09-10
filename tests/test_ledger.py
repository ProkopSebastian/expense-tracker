from __future__ import annotations

import json
from datetime import date
from decimal import Decimal

from expense_tracker.database import Database
from expense_tracker.ledger import merchant_key, pending_merchant_suggestion_transaction_ids
from expense_tracker.models import Transaction


def test_merchant_key_prefers_a_domain_over_surrounding_noise() -> None:
    noisy = (
        "WWW.VIVACUBA.PL|PAYPRO S.A. PASTELOWA POZNAN|/OPT/X/////P -V C-G T-F Y KARNET N A "
        "WEJSCIA |NUMER TRANSAKCJI BLIK: 123456789"
    )
    assert merchant_key(noisy) == "vivacuba.pl"


def test_merchant_key_without_a_domain_falls_back_to_normalized_text() -> None:
    assert merchant_key("EasyJet") == "easyjet"
    assert merchant_key("MR.ROLLO WARSZAWA Nr karty ...4724 35,00PLN") == "mr.rollo warszawa"


def test_pending_merchant_suggestion_transaction_ids(database: Database) -> None:
    payload = {
        "transaction_ids": [1, 2],
        "category_key": "food",
        "confidence": 0.5,
        "rationale": "x",
        "should_create_rule": False,
    }
    database.connection.execute(
        """INSERT INTO suggestions (fingerprint, kind, payload_json, confidence, source, status)
        VALUES ('fp1', 'merchant_classification', ?, 0.5, 'llm', 'suggested')""",
        (json.dumps(payload),),
    )
    database.connection.commit()

    assert pending_merchant_suggestion_transaction_ids(database.connection) == {1, 2}


def test_pending_merchant_suggestion_transaction_ids_ignores_decided_suggestions(database: Database) -> None:
    database.insert_transactions(
        [
            Transaction(
                account="nest", booking_date=date(2026, 9, 1), amount=Decimal("-10"), currency="PLN", description="x"
            )
        ]
    )
    payload = {
        "transaction_ids": [1],
        "category_key": "food",
        "confidence": 0.5,
        "rationale": "x",
        "should_create_rule": False,
    }
    database.connection.execute(
        """INSERT INTO suggestions (fingerprint, kind, payload_json, confidence, source, status)
        VALUES ('fp1', 'merchant_classification', ?, 0.5, 'llm', 'approved')""",
        (json.dumps(payload),),
    )
    database.connection.commit()

    assert pending_merchant_suggestion_transaction_ids(database.connection) == set()
