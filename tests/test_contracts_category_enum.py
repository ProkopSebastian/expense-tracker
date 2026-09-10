from __future__ import annotations

import pytest
from pydantic import ValidationError

from expense_tracker.llm.contracts import build_merchant_analysis_model, build_relation_analysis_model

CATEGORY_KEYS = ("food", "transport", "uncategorized_expense")


def _classification(category_key: object) -> dict[str, object]:
    return {
        "transaction_ids": [1],
        "category_key": category_key,
        "confidence": 0.5,
        "rationale": "test",
        "should_create_rule": False,
    }


def test_dynamic_merchant_schema_rejects_unknown_category_key_at_validation() -> None:
    model = build_merchant_analysis_model(CATEGORY_KEYS)
    with pytest.raises(ValidationError):
        model.model_validate({"classifications": [_classification("made_up_category")]})


def test_dynamic_merchant_schema_accepts_known_category_key() -> None:
    model = build_merchant_analysis_model(CATEGORY_KEYS)
    result = model.model_validate({"classifications": [_classification("food")]})
    assert result.classifications[0].category_key == "food"


def _relation(category_key: object) -> dict[str, object]:
    return {
        "kind": "own_transfer",
        "title": "Transfer",
        "transaction_ids": [1, 2],
        "category_key": category_key,
        "personal_amount": 0,
        "currency": "PLN",
        "confidence": 0.9,
        "rationale": "test",
    }


def test_dynamic_relation_schema_allows_null_category() -> None:
    model = build_relation_analysis_model(CATEGORY_KEYS)
    result = model.model_validate({"suggestions": [_relation(None)]})
    assert result.suggestions[0].category_key is None


def test_dynamic_relation_schema_rejects_unknown_category_key() -> None:
    model = build_relation_analysis_model(CATEGORY_KEYS)
    with pytest.raises(ValidationError):
        model.model_validate({"suggestions": [_relation("made_up_category")]})
