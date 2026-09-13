from datetime import date
from decimal import Decimal

import httpx
import pytest
from fastapi.testclient import TestClient
from openai import APIConnectionError, AuthenticationError, RateLimitError

from expense_tracker.api import create_app
from expense_tracker.config import settings
from expense_tracker.database import Database
from expense_tracker.llm.service import MerchantAnalysisResult, _save_suggestion
from expense_tracker.models import Transaction


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "web.sqlite3")) as client:
        yield client


def add(client, amount="-25.50", currency="PLN", description="Sklep"):
    response = client.post(
        "/api/transactions",
        json={
            "account": "Gotówka",
            "booking_date": "2026-09-11",
            "amount": amount,
            "currency": currency,
            "description": description,
            "category_key": "groceries",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def group_payload(ids):
    return {
        "title": "Wspólne zakupy",
        "kind": "shared_purchase",
        "personal_amount": "15.50",
        "currency": "PLN",
        "category_key": "groceries",
        "members": [{"transaction_id": tid, "role": "purchase"} for tid in ids],
    }


def test_manual_recategorize_group_and_dissolve(client):
    ids = [add(client), add(client, "10.00", description="Zwrot")]
    assert client.put(f"/api/transactions/{ids[0]}/category", json={"category_key": "shopping"}).status_code == 200
    assert client.get("/api/ledger").json()["total"] == 2
    response = client.post("/api/cases", json=group_payload(ids))
    assert response.status_code == 201, response.text
    case_id = response.json()["id"]
    body = client.get("/api/ledger?q=Zwrot&direction=expense").json()
    assert body["total"] == 1
    assert len(body["blocks"][0]["members"]) == 2
    assert body["blocks"][0]["real_amount"] == "-15.50"
    assert client.get("/api/ledger?direction=income").json()["total"] == 0
    assert client.put(f"/api/transactions/{ids[0]}/category", json={"category_key": "food"}).status_code == 422
    assert client.get("/api/summary").json()["expenses"] == "15.50"
    assert client.delete(f"/api/cases/{case_id}").status_code == 200
    assert client.get("/api/ledger").json()["total"] == 2


def test_reject_invalid_or_overlapping_groups_without_partial_writes(client):
    first = add(client)
    euro = add(client, currency="EUR")
    for ids in [[first, euro], [first, first], [first, 9999]]:
        assert client.post("/api/cases", json=group_payload(ids)).status_code == 422
    assert client.get("/api/ledger").json()["cases"] == []
    second = add(client)
    assert client.post("/api/cases", json=group_payload([first, second])).status_code == 201
    assert client.post("/api/cases", json=group_payload([first, second])).status_code == 422
    assert len(client.get("/api/ledger").json()["cases"]) == 1


def test_own_transfer_normalization_and_validation(client):
    ids = [add(client, "-100"), add(client, "100")]
    payload = group_payload(ids) | {"kind": "own_transfer", "personal_amount": "999"}
    assert client.post("/api/cases", json=payload).status_code == 201
    assert client.get("/api/summary").json()["expenses"] == "0"
    assert client.get("/api/summary").json()["income"] == "0"
    invalid = {
        "account": " ",
        "booking_date": "2026-09-11",
        "amount": "NaN",
        "currency": "PLN",
        "description": "x",
        "category_key": "groceries",
    }
    assert client.post("/api/transactions", json=invalid).status_code == 422


def test_rules_update_previous_rule_classifications(client):
    tid = add(client)
    client.put(f"/api/transactions/{tid}/category", json={"category_key": "groceries", "remember": True})
    rule = client.get("/api/rules").json()["rules"][0]
    assert client.put(f"/api/rules/{rule['id']}", json={"category_key": "shopping"}).status_code == 200
    assert client.put(f"/api/rules/{rule['id']}", json={"category_key": "not-a-category"}).status_code == 422
    assert client.delete(f"/api/rules/{rule['id']}").status_code == 200
    assert client.get("/api/rules").json()["rules"] == []


def test_classification_suggestions_and_ai_adapter(tmp_path, monkeypatch):
    path = tmp_path / "suggestions.sqlite3"
    db = Database(path)
    tid = db.insert_transaction(
        Transaction(
            account="Test", booking_date=date(2026, 9, 11), amount=Decimal("-20"), currency="PLN", description="Sklep"
        )
    )
    _save_suggestion(
        db.connection,
        "merchant_classification",
        {
            "transaction_ids": [tid],
            "category_key": "groceries",
            "rationale": "Żywność",
            "confidence": 0.9,
            "should_create_rule": True,
        },
    )
    db.connection.commit()
    db.close()
    with TestClient(create_app(path)) as client:
        row = client.get("/api/classification").json()["rows"][0]
        assert row["totals"] == {"PLN": "-20"}
        assert (
            client.post(
                f"/api/suggestions/{row['suggestion_id']}/approve", json={"category_key": "groceries", "remember": True}
            ).status_code
            == 200
        )
        assert client.get("/api/classification").json()["rows"] == []
        assert len(client.get("/api/rules").json()["rules"]) == 1
        monkeypatch.setattr(settings, "openai_api_key", None)
        assert client.post("/api/ai/merchants").status_code == 503
        from pydantic import SecretStr

        monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-only"))
        monkeypatch.setattr(
            "expense_tracker.web_routes.ai.analyze_merchants", lambda db: MerchantAnalysisResult(1, 2, 3, 4)
        )
        assert client.post("/api/ai/merchants").json() == {
            "saved": 1,
            "groups_processed": 2,
            "groups_remaining": 3,
            "web_searches": 4,
        }
        client.app.state.ai_lock.acquire()
        assert client.post("/api/ai/relations").status_code == 409
        client.app.state.ai_lock.release()


@pytest.mark.parametrize(
    ("kind", "expected_status", "expected_message"),
    [
        ("authentication", 401, "Klucz API jest nieprawidłowy"),
        ("quota", 429, "Brak dostępnych środków"),
        ("rate_limit", 429, "chwilowy limit"),
        ("connection", 502, "Nie udało się połączyć"),
    ],
)
def test_ai_errors_have_actionable_messages(client, monkeypatch, kind, expected_status, expected_message):
    from pydantic import SecretStr

    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-only"))
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(429 if kind in {"quota", "rate_limit"} else 401, request=request)
    errors = {
        "authentication": AuthenticationError("invalid", response=response, body={"code": "invalid_api_key"}),
        "quota": RateLimitError("quota", response=response, body={"code": "insufficient_quota"}),
        "rate_limit": RateLimitError("slow down", response=response, body={"code": "rate_limit_exceeded"}),
        "connection": APIConnectionError(request=request),
    }

    def fail_analysis(db):
        raise errors[kind]

    monkeypatch.setattr("expense_tracker.web_routes.ai.analyze_merchants", fail_analysis)
    result = client.post("/api/ai/merchants")
    assert result.status_code == expected_status
    assert expected_message in result.json()["detail"]


def test_write_origin_guard_and_empty_sync(client, tmp_path, monkeypatch):
    assert client.post("/api/sync", headers={"Origin": "https://unrelated.example"}).status_code == 403
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    assert client.post("/api/sync").json()["transactions_inserted"] == 0


def test_pagination_never_splits_groups(client):
    ids = [add(client) for _ in range(102)]
    assert client.post("/api/cases", json=group_payload(ids[:2])).status_code == 201
    first = client.get("/api/ledger?page=1").json()
    second = client.get("/api/ledger?page=2").json()
    third = client.get("/api/ledger?page=3").json()
    assert len(first["blocks"]) == 50 and len(second["blocks"]) == 50 and len(third["blocks"]) == 1
    groups = [b for b in first["blocks"] + second["blocks"] + third["blocks"] if b["case_id"]]
    assert len(groups) == 1 and len(groups[0]["members"]) == 2
