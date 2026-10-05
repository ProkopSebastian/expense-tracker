from fastapi.testclient import TestClient

from expense_tracker.api import create_app


def _asset(client, name, kind="account", currency="PLN"):
    response = client.post("/api/wealth/assets", json={"name": name, "kind": kind, "currency": currency})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _snapshot(client, day, balances, rates=None):
    response = client.post(
        "/api/wealth/snapshots",
        json={
            "day": day,
            "balances": [{"asset_id": asset_id, "amount": amount} for asset_id, amount in balances.items()],
            "rates": rates or {},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_snapshots_keep_their_own_rates_gaps_zeros_and_debts(tmp_path):
    with TestClient(create_app(tmp_path / "wealth.sqlite3")) as client:
        bank = _asset(client, "Konto")
        euro = _asset(client, "Revolut EUR", currency="EUR")
        debt = _asset(client, "Pożyczka", kind="debt")
        _snapshot(client, "2026-01-31", {bank: "1000", euro: "100"}, {"EUR": "4.30"})
        _snapshot(client, "2026-03-31", {bank: "0", euro: "100", debt: "-250.50"}, {"EUR": "4.10"})

        transactions = client.get("/api/ledger").json()["total"]
        overview = client.get("/api/wealth").json()

    first, second = overview["snapshots"]
    assert first["total"] == "1430.00"
    assert first["change"] is None
    assert first["rates"] == {"EUR": "4.30"}
    assert debt not in {balance["asset_id"] for balance in first["balances"]}
    assert second["total"] == "159.50"
    assert second["change"] == "-1270.50"
    assert second["by_kind"] == {"account": "410.00", "debt": "-250.50"}
    latest = {asset["id"]: asset["latest"] for asset in overview["assets"]}
    assert latest[bank]["amount"] == "0"
    assert latest[euro] == {"day": "2026-03-31", "amount": "100", "rate": "4.10", "pln": "410.00"}
    assert transactions == 0


def test_foreign_balance_needs_the_rate_from_its_day(tmp_path):
    with TestClient(create_app(tmp_path / "wealth.sqlite3")) as client:
        euro = _asset(client, "Gotówka EUR", kind="cash", currency="EUR")
        response = client.post(
            "/api/wealth/snapshots",
            json={"day": "2026-01-31", "balances": [{"asset_id": euro, "amount": "50"}], "rates": {}},
        )

    assert response.status_code == 422
    assert "kurs EUR" in response.json()["detail"]


def test_recording_a_day_again_replaces_it_but_editing_cannot_collide(tmp_path):
    with TestClient(create_app(tmp_path / "wealth.sqlite3")) as client:
        bank = _asset(client, "Konto")
        bonds = _asset(client, "Obligacje", kind="bonds")
        january = _snapshot(client, "2026-01-31", {bank: "100", bonds: "900"})
        again = _snapshot(client, "2026-01-31", {bank: "1000"})
        february = _snapshot(client, "2026-02-28", {bank: "1200"})
        collision = client.put(
            f"/api/wealth/snapshots/{february}",
            json={"day": "2026-01-31", "balances": [{"asset_id": bank, "amount": "1"}]},
        )
        overview = client.get("/api/wealth").json()

    assert again == january
    assert collision.status_code == 422
    assert [snapshot["day"] for snapshot in overview["snapshots"]] == ["2026-01-31", "2026-02-28"]
    assert overview["snapshots"][0]["balances"] == [{"asset_id": bank, "amount": "1000", "pln": "1000.00"}]


def test_inactive_asset_keeps_history_and_cannot_be_deleted_with_it(tmp_path):
    with TestClient(create_app(tmp_path / "wealth.sqlite3")) as client:
        bonds = _asset(client, "Obligacje", kind="bonds")
        _snapshot(client, "2026-01-31", {bonds: "500"})
        deactivated = client.put(
            f"/api/wealth/assets/{bonds}", json={"name": "Obligacje", "kind": "bonds", "is_active": False}
        )
        deleted = client.delete(f"/api/wealth/assets/{bonds}")
        overview = client.get("/api/wealth").json()

    assert deactivated.status_code == 200
    assert deleted.status_code == 422
    [asset] = overview["assets"]
    assert asset["is_active"] is False
    assert overview["snapshots"][0]["total"] == "500.00"
