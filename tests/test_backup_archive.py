import json
import sqlite3
from contextlib import closing
from datetime import date
from decimal import Decimal
from pathlib import Path
from zipfile import ZipFile

import pytest

from expense_tracker import ledger
from expense_tracker.backup_archive import DATABASE, MANIFEST, inspect_archive, restore_archive, write_archive
from expense_tracker.database import _MIGRATIONS, Database


def add_coffee(database_path: Path, description: str) -> None:
    database = Database(database_path)
    try:
        ledger.add_manual_transaction(
            database.connection, account="Bank", booking_date=date(2026, 11, 1), amount=Decimal("-12"),
            currency="PLN", description=description, counterparty=None, category_key="food_coffee",
        )
    finally:
        database.close()


def descriptions(database_path: Path) -> list[str]:
    with closing(sqlite3.connect(database_path)) as connection:
        return [row[0] for row in connection.execute("SELECT description FROM transactions ORDER BY id")]


@pytest.fixture
def app_dirs(tmp_path: Path) -> tuple[Path, Path, Path]:
    root = tmp_path / "app"
    (root / "data").mkdir(parents=True)
    return root / "expense-tracker.sqlite3", root / "data", root


def test_restoring_a_backup_brings_back_data_statements_and_settings(app_dirs, tmp_path):
    database_path, data_dir, config_dir = app_dirs
    add_coffee(database_path, "Kawa z kopii")
    (data_dir / "wyciag.csv").write_text("statement", encoding="utf-8")
    (config_dir / "appearance.json").write_text('{"theme": "forest"}', encoding="utf-8")
    archive = tmp_path / "kopia.zip"
    write_archive(database_path, data_dir, config_dir, archive)

    add_coffee(database_path, "Kawa po kopii")
    (data_dir / "wyciag.csv").unlink()
    (data_dir / "nowy.csv").write_text("new", encoding="utf-8")
    (config_dir / "appearance.json").write_text('{"theme": "night"}', encoding="utf-8")

    assert inspect_archive(archive).contents.transactions == 1
    safety = restore_archive(archive, database_path, data_dir, config_dir)

    assert descriptions(database_path) == ["Kawa z kopii"]
    assert sorted(file.name for file in data_dir.iterdir()) == ["wyciag.csv"]
    assert json.loads((config_dir / "appearance.json").read_text())["theme"] == "forest"
    with ZipFile(safety) as replaced:
        assert "data/nowy.csv" in replaced.namelist()


def test_backup_from_a_newer_version_is_refused_without_touching_data(app_dirs, tmp_path):
    database_path, data_dir, config_dir = app_dirs
    add_coffee(database_path, "Moja kawa")
    archive = tmp_path / "kopia.zip"
    write_archive(database_path, data_dir, config_dir, archive)
    newer = tmp_path / "nowsza.zip"
    with ZipFile(archive) as source, ZipFile(newer, "w") as target:
        manifest = json.loads(source.read(MANIFEST)) | {"schema_version": len(_MIGRATIONS) + 1, "app_version": "9.0.0"}
        target.writestr(MANIFEST, json.dumps(manifest))
        target.writestr(DATABASE, source.read(DATABASE))

    with pytest.raises(ValueError, match="nowszej wersji Wydatków \\(9.0.0\\)"):
        restore_archive(newer, database_path, data_dir, config_dir)
    assert descriptions(database_path) == ["Moja kawa"]


def test_backup_from_an_older_version_is_migrated_on_restore(app_dirs, tmp_path):
    database_path, data_dir, config_dir = app_dirs
    add_coffee(database_path, "Obecna kawa")
    legacy = tmp_path / "legacy.sqlite3"
    with closing(sqlite3.connect(legacy)) as connection:
        connection.executescript("""
            CREATE TABLE transactions (
                id INTEGER PRIMARY KEY, account TEXT NOT NULL, booking_date TEXT NOT NULL, value_date TEXT,
                amount TEXT NOT NULL, currency TEXT NOT NULL, description TEXT NOT NULL, counterparty TEXT,
                external_id TEXT, balance TEXT, raw_json TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE,
                imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO transactions (account, booking_date, amount, currency, description, raw_json, fingerprint)
            VALUES ('nest', '2026-01-05', '-9', 'PLN', 'Stara kawa', '{}', 'f1');
        """)
    archive = tmp_path / "stara.zip"
    with ZipFile(archive, "w") as target:
        target.writestr(MANIFEST, json.dumps({"format": 1, "app_version": "0.1.0", "schema_version": 0}))
        target.write(legacy, DATABASE)

    restore_archive(archive, database_path, data_dir, config_dir)

    assert descriptions(database_path) == ["Stara kawa"]
    with closing(sqlite3.connect(database_path)) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == len(_MIGRATIONS)
