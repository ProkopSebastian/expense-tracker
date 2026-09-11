
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from expense_tracker.api import create_app
from expense_tracker.config import settings
from expense_tracker.database import Database
from expense_tracker.ledger import save_decision, transactions
from expense_tracker.models import Transaction
from expense_tracker.recovery import backup_database, record_undo, undo_last


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", None)
    with TestClient(create_app(tmp_path / "test.sqlite3")) as client:
        yield client


def csv(state="PENDING", amount="-40"):
    return (
        "Type,Product,Started Date,Completed Date,Description,Amount,Currency,State\n"
        f"Card Payment,Current,2026-09-01 10:00:00,,Shop,{amount},PLN,{state}\n"
    ).encode()


def test_upload_update_and_undo(client):
    assert client.post("/api/import", content=csv()).status_code == 200
    row = client.get("/api/ledger").json()["blocks"][0]
    tid = row["id"]
    assert row["bank_status"] == "PENDING"
    assert client.put(f"/api/transactions/{tid}/category", json={"category_key": "groceries"}).status_code == 200
    assert client.post("/api/import", content=csv("COMPLETED", "-41")).status_code == 200
    [row] = client.get("/api/ledger").json()["blocks"]
    assert (row["id"], row["amount"], row["category_key"]) == (tid, "-41", "groceries")
    assert client.post("/api/undo").status_code == 200
    [row] = client.get("/api/ledger").json()["blocks"]
    assert (row["amount"], row["bank_status"]) == ("-40", "PENDING")
    assert client.get("/api/recovery").json() == {"can_undo": False}


def test_account_isolation_and_default_name_idempotence(client):
    assert client.post("/api/import", content=csv()).status_code == 200
    assert client.post("/api/import?account=revolut", content=csv()).status_code == 200
    assert len(client.get("/api/ledger").json()["blocks"]) == 1
    assert client.post("/api/import?account=Joint", content=csv()).status_code == 200
    assert len(client.get("/api/ledger").json()["blocks"]) == 2


def test_ambiguous_rows_fail_atomically(client):
    data = csv() + b"Card Payment,Current,2026-09-01 10:00:00,,Other shop,-50,PLN,PENDING\n"
    assert client.post("/api/import", content=data).status_code == 422
    assert client.get("/api/ledger").json()["blocks"] == []


def test_settings_never_return_key(client):
    token = "test-local-key-not-real"
    assert client.put("/api/settings/ai", json={"api_key": token}).status_code == 200
    response = client.get("/api/meta")
    assert response.json()["ai_enabled"] is True
    assert token not in response.text
    assert client.put("/api/settings/ai", json={"clear_key": True}).status_code == 200
    assert client.get("/api/meta").json()["ai_enabled"] is False


def test_backup_retention_keeps_current_undo(tmp_path):
    path = tmp_path / "test.sqlite3"
    db = Database(path)
    tid = db.insert_transaction(Transaction("cash", date(2026, 9, 1), Decimal(-10), "PLN", "Test"))
    initial = backup_database(path, "action")
    save_decision(db.connection, tid, "groceries")
    record_undo(path, initial)
    for _ in range(31):
        snapshot = backup_database(path, "action")
        record_undo(path, snapshot)
    assert initial.exists()
    undo_last(path)
    assert transactions(db.connection)[0]["category_key"] is None
    db.close()
