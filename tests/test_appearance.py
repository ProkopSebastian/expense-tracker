from fastapi.testclient import TestClient

from expense_tracker.api import create_app


def test_appearance_survives_app_restart(tmp_path):
    database_path = tmp_path / "expenses.sqlite3"

    with TestClient(create_app(database_path)) as client:
        assert client.get("/api/settings/appearance").json() == {"theme": "system"}
        assert client.put("/api/settings/appearance", json={"theme": "forest"}).status_code == 200
        assert client.put("/api/settings/appearance", json={"theme": "unknown"}).status_code == 422

    with TestClient(create_app(database_path)) as client:
        assert client.get("/api/settings/appearance").json() == {"theme": "forest"}

    assert (tmp_path / "appearance.json").read_text(encoding="utf-8") == '{"theme": "forest"}'
