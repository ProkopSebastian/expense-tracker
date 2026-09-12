from datetime import date
from decimal import Decimal

import pytest

from expense_tracker.data_reset import reset_financial_data
from expense_tracker.database import Database
from expense_tracker.models import Transaction


def test_reset_clears_finances_and_owned_directories(tmp_path):
    database_path = tmp_path / "expense-tracker.sqlite3"
    data_dir = tmp_path / "data"
    backup_dir = tmp_path / "expense-tracker-backups"
    data_dir.mkdir()
    backup_dir.mkdir()
    (data_dir / "sample.csv").write_text("sample")
    (backup_dir / "backup.sqlite3").write_text("backup")
    preferences = tmp_path / "ai-settings.json"
    preferences.write_text('{"api_key":"test-key"}')

    database = Database(database_path)
    database.insert_transaction(
        Transaction("cash", date(2026, 9, 1), Decimal(-10), "PLN", "Sample")
    )
    database.close()

    reset_financial_data(database_path, data_dir)

    assert list(data_dir.iterdir()) == []
    assert not backup_dir.exists()
    assert preferences.read_text() == '{"api_key":"test-key"}'
    database = Database(database_path)
    assert database.connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 0
    assert database.connection.execute("SELECT COUNT(*) FROM categories").fetchone()[0] > 0
    database.close()


def test_reset_refuses_a_data_directory_outside_the_runtime_directory(tmp_path):
    runtime_dir = tmp_path / "runtime"
    runtime_dir.mkdir()
    database_path = runtime_dir / "expense-tracker.sqlite3"
    database = Database(database_path)
    database.close()
    unrelated = tmp_path / "unrelated"
    unrelated.mkdir()
    protected = unrelated / "keep.txt"
    protected.write_text("keep")

    with pytest.raises(ValueError, match="standardowym folderem"):
        reset_financial_data(database_path, unrelated)

    assert protected.read_text() == "keep"
