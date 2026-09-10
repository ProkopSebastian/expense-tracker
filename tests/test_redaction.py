from datetime import date
from decimal import Decimal
from unittest.mock import patch

from expense_tracker.database import Database
from expense_tracker.llm import service
from expense_tracker.llm.redaction import redact_text
from expense_tracker.models import Transaction


def test_redacts_sensitive_tokens() -> None:
    value = "Jan 10187010452078109171180002, tel. +48 500 600 700, jan@example.com"

    redacted = redact_text(value)

    assert "10187010452078109171180002" not in redacted
    assert "+48 500 600 700" not in redacted
    assert "jan@example.com" not in redacted
    assert "[RACHUNEK]" in redacted


def test_merchant_classification_payload_never_contains_raw_pii(database: Database) -> None:
    database.insert_transactions(
        [
            Transaction(
                account="nest",
                booking_date=date(2026, 9, 1),
                amount=Decimal("-35"),
                currency="PLN",
                description="MR.ROLLO WARSZAWA Nr karty ...4724 35,00PLN",
                counterparty="jan.kowalski@example.com 37187010452078109171180001",
            )
        ]
    )

    captured: dict[str, str] = {}

    def fake_request(model, instructions, input_text, max_tool_calls):
        captured["input_text"] = input_text
        return model.model_validate({"classifications": []})

    with patch.object(service, "_request", fake_request):
        service.analyze_merchants(database.connection)

    assert "jan.kowalski@example.com" not in captured["input_text"]
    assert "4724" not in captured["input_text"]
    assert "37187010452078109171180001" not in captured["input_text"]
