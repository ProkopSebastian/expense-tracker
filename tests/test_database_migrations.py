from __future__ import annotations

import sqlite3
from pathlib import Path

from expense_tracker.database import Database

LEGACY_SCHEMA = """
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY, account TEXT NOT NULL, booking_date TEXT NOT NULL, value_date TEXT,
    amount TEXT NOT NULL, currency TEXT NOT NULL, description TEXT NOT NULL, counterparty TEXT,
    external_id TEXT, balance TEXT, raw_json TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE categories (
    key TEXT PRIMARY KEY, label TEXT NOT NULL, parent_key TEXT REFERENCES categories(key),
    kind TEXT NOT NULL CHECK(kind IN ('expense', 'income', 'transfer', 'adjustment'))
);
CREATE TABLE links (
    id INTEGER PRIMARY KEY, left_transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    right_transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    kind TEXT NOT NULL CHECK(kind IN ('own_transfer', 'shared_expense_settlement')),
    confidence REAL NOT NULL, source TEXT NOT NULL CHECK(source IN ('rule', 'manual', 'llm')),
    note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(left_transaction_id, right_transaction_id, kind)
);
CREATE TABLE classifications (
    transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id), category TEXT NOT NULL,
    confidence REAL NOT NULL, source TEXT NOT NULL CHECK(source IN ('rule', 'manual', 'llm')),
    note TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def _make_legacy_database(path: Path) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(LEGACY_SCHEMA)
    connection.execute(
        """INSERT INTO transactions
        (account, booking_date, amount, currency, description, raw_json, fingerprint)
        VALUES ('nest', '2026-09-01', '-10', 'PLN', 'Kawa', '{}', 'abc123')"""
    )
    connection.commit()
    connection.close()


def test_drops_legacy_tables_without_touching_real_data(tmp_path: Path) -> None:
    path = tmp_path / "legacy.sqlite3"
    _make_legacy_database(path)

    database = Database(path)
    try:
        tables = {
            row["name"] for row in database.connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert "links" not in tables
        assert "classifications" not in tables
        row = database.connection.execute("SELECT description, amount FROM transactions").fetchone()
        assert row["description"] == "Kawa"
        assert row["amount"] == "-10"
    finally:
        database.close()


def test_migration_is_idempotent_across_repeated_opens(tmp_path: Path) -> None:
    path = tmp_path / "fresh.sqlite3"

    first = Database(path)
    first.close()
    second = Database(path)
    try:
        version = second.connection.execute("PRAGMA user_version").fetchone()[0]
        assert version == 3
    finally:
        second.close()


def test_nest_date_migration_preserves_classification_and_reimport(tmp_path: Path) -> None:
    import json

    from expense_tracker.database import CATEGORIES, SCHEMA
    from expense_tracker.importers import import_nest_csv

    path = tmp_path / "nest-previous.sqlite3"
    raw = {
        "Data księgowania": "10-09-2026",
        "Data operacji": "09-09-2026",
        "Kwota": "-12,50",
        "Waluta": "PLN",
        "Opis": "Obiad",
    }
    connection = sqlite3.connect(path)
    connection.executescript(SCHEMA)
    connection.executemany("INSERT INTO categories(key,label,parent_key,kind) VALUES (?,?,?,?)", CATEGORIES)
    connection.execute(
        "INSERT INTO transactions(id,account,booking_date,amount,currency,description,raw_json,fingerprint) "
        "VALUES(1,'nest','2026-09-10','-12.50','PLN','Obiad',?,'old')",
        (json.dumps(raw),),
    )
    connection.execute(
        "INSERT INTO transaction_decisions(transaction_id,category_key,source,status,confidence) "
        "VALUES(1,'groceries','manual','approved',1)"
    )
    connection.execute("PRAGMA user_version=2")
    connection.commit()
    connection.close()
    db = Database(path)
    row = db.connection.execute("SELECT booking_date FROM transactions WHERE id=1").fetchone()
    assert row["booking_date"] == "2026-09-09"
    assert (
        db.connection.execute("SELECT category_key FROM transaction_decisions WHERE transaction_id=1").fetchone()[0]
        == "groceries"
    )
    export = tmp_path / "nest.csv"
    export.write_text(";".join(raw) + "\n" + ";".join(raw.values()) + "\n")
    assert db.insert_transactions(import_nest_csv(export)) == (0, 1)
    assert list(tmp_path.glob("nest-previous-backups/startup-*.sqlite3"))
    db.close()
