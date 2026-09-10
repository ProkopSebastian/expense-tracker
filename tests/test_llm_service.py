from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import SecretStr

from expense_tracker.database import Database
from expense_tracker.llm import service
from expense_tracker.models import Transaction


def test_analyze_merchants_includes_income_transactions(database: Database) -> None:
    database.insert_transactions(
        [
            Transaction(
                account="nest",
                booking_date=date(2026, 9, 1),
                amount=Decimal("5200"),
                currency="PLN",
                description="Wynagrodzenie za wrzesien",
            )
        ]
    )

    captured: dict[str, str] = {}

    def fake_request(model, instructions, input_text, max_tool_calls):
        captured["input_text"] = input_text
        return model.model_validate({"classifications": []}), 0

    with patch.object(service, "_request", fake_request):
        result = service.analyze_merchants(database.connection)

    assert result.groups_processed == 1
    assert "5200.0" in captured["input_text"]


def test_analyze_merchants_falls_back_to_income_category_for_positive_amount(database: Database) -> None:
    database.insert_transactions(
        [
            Transaction(
                account="nest",
                booking_date=date(2026, 9, 1),
                amount=Decimal("300"),
                currency="PLN",
                description="Zwrot od znajomego",
            )
        ]
    )
    transaction_id = database.connection.execute("SELECT id FROM transactions").fetchone()["id"]

    # The dynamic schema (llm/contracts.py) would normally reject an unknown category_key
    # outright; here _request is replaced entirely to exercise the service-level fallback
    # directly (defense in depth for the sign-aware "invalid category" case).
    def fake_request(model, instructions, input_text, max_tool_calls):
        item = SimpleNamespace(
            transaction_ids=[transaction_id],
            category_key="not_a_real_category",
            confidence=0.3,
            rationale="unclear",
            should_create_rule=False,
        )
        return SimpleNamespace(classifications=[item]), 0

    with patch.object(service, "_request", fake_request):
        result = service.analyze_merchants(database.connection)

    row = database.connection.execute(
        "SELECT payload_json FROM suggestions WHERE kind = 'merchant_classification'"
    ).fetchone()
    payload = json.loads(row["payload_json"])
    assert payload["category_key"] == "income"
    assert result.saved == 1


def test_analyze_merchants_does_not_resend_transactions_with_a_pending_suggestion(database: Database) -> None:
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
    transaction_id = database.connection.execute("SELECT id FROM transactions").fetchone()["id"]

    call_count = 0

    def fake_request(model, instructions, input_text, max_tool_calls):
        nonlocal call_count
        call_count += 1
        item = SimpleNamespace(
            transaction_ids=[transaction_id],
            category_key="food_restaurants",
            confidence=0.6,
            rationale=f"guess #{call_count}",
            should_create_rule=False,
        )
        return SimpleNamespace(classifications=[item]), 0

    with patch.object(service, "_request", fake_request):
        first = service.analyze_merchants(database.connection)
        second = service.analyze_merchants(database.connection)

    assert first.groups_processed == 1
    assert second.groups_processed == 0
    count = database.connection.execute(
        "SELECT COUNT(*) AS n FROM suggestions WHERE kind = 'merchant_classification'"
    ).fetchone()["n"]
    assert count == 1


def test_request_counts_web_search_calls_from_the_response(database: Database) -> None:
    database.insert_transactions(
        [
            Transaction(
                account="nest",
                booking_date=date(2026, 9, 1),
                amount=Decimal("-40"),
                currency="PLN",
                description="OBSCURE MERCHANT XYZ",
            )
        ]
    )

    fake_response = SimpleNamespace(
        output=[
            SimpleNamespace(type="web_search_call"),
            SimpleNamespace(type="reasoning"),
            SimpleNamespace(type="web_search_call"),
        ],
        output_text='{"classifications": []}',
    )
    fake_client = SimpleNamespace(responses=SimpleNamespace(create=lambda **kwargs: fake_response))

    with (
        patch.object(service, "OpenAI", lambda api_key: fake_client),
        patch.object(service.settings, "openai_api_key", SecretStr("test-key")),
    ):
        result = service.analyze_merchants(database.connection)

    assert result.web_searches == 2
