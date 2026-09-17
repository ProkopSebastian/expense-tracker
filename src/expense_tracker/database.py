from __future__ import annotations

import hashlib
import json
import sqlite3
from collections.abc import Callable
from contextlib import nullcontext
from pathlib import Path

from .import_identity import bank_state, reconcile, source_key
from .models import Transaction

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY, account TEXT NOT NULL, booking_date TEXT NOT NULL, value_date TEXT,
    amount TEXT NOT NULL, currency TEXT NOT NULL, description TEXT NOT NULL, merchant TEXT, counterparty TEXT,
    external_id TEXT, transaction_type TEXT, balance TEXT, raw_json TEXT NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(booking_date);
CREATE TABLE IF NOT EXISTS categories (
    key TEXT PRIMARY KEY, label TEXT NOT NULL, parent_key TEXT REFERENCES categories(key),
    kind TEXT NOT NULL CHECK(kind IN ('expense', 'income', 'transfer', 'adjustment')),
    icon TEXT, color TEXT, is_custom INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS transaction_decisions (
    transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id),
    category_key TEXT NOT NULL REFERENCES categories(key),
    source TEXT NOT NULL CHECK(source IN ('manual', 'rule', 'llm')),
    status TEXT NOT NULL CHECK(status IN ('suggested', 'approved', 'rejected')),
    confidence REAL NOT NULL, explanation TEXT, merchant_key TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS merchant_rules (
    id INTEGER PRIMARY KEY, merchant_key TEXT NOT NULL UNIQUE,
    category_key TEXT NOT NULL REFERENCES categories(key), priority INTEGER NOT NULL DEFAULT 100,
    is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('own_transfer', 'shared_purchase', 'reimbursement', 'refund', 'payment_dispute')),
    title TEXT NOT NULL, category_key TEXT REFERENCES categories(key), personal_amount TEXT NOT NULL,
    currency TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('suggested', 'approved', 'rejected')),
    source TEXT NOT NULL CHECK(source IN ('manual', 'rule', 'llm')), explanation TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS case_members (
    case_id INTEGER NOT NULL REFERENCES cases(id), transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id),
    role TEXT NOT NULL CHECK(role IN (
        'purchase', 'received_reimbursement', 'paid_settlement', 'received_refund', 'account_transfer'
    )),
    PRIMARY KEY(case_id, transaction_id)
);
CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, payload_json TEXT NOT NULL,
    confidence REAL NOT NULL, source TEXT NOT NULL CHECK(source IN ('rule', 'llm')), prompt_version TEXT,
    status TEXT NOT NULL CHECK(status IN ('suggested', 'approved', 'rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TEXT
);
CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY, file_name TEXT NOT NULL, file_hash TEXT NOT NULL UNIQUE, importer TEXT NOT NULL,
    rows_found INTEGER NOT NULL, rows_inserted INTEGER NOT NULL, rows_skipped_duplicate INTEGER NOT NULL,
    parser_version INTEGER NOT NULL DEFAULT 1,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

CATEGORIES = (
    ("uncategorized_expense", "Niesklasyfikowane wydatki", None, "expense"),
    ("food", "Jedzenie", None, "expense"),
    ("food_restaurants", "Restauracje i dostawy", "food", "expense"),
    ("groceries", "Zakupy spożywcze", "food", "expense"),
    ("food_delivery", "Dowóz jedzenia", "food", "expense"),
    ("food_coffee", "Kawa i przekąski", "food", "expense"),
    ("food_alcohol", "Alkohol", "food", "expense"),
    ("travel", "Podróże", None, "expense"),
    ("travel_flights", "Loty", "travel", "expense"),
    ("travel_accommodation", "Noclegi", "travel", "expense"),
    ("travel_transport", "Transport w podróży", "travel", "expense"),
    ("transport", "Transport", None, "expense"),
    ("transport_fuel", "Paliwo", "transport", "expense"),
    ("transport_public", "Transport publiczny", "transport", "expense"),
    ("transport_taxi", "Taxi i przejazdy", "transport", "expense"),
    ("transport_parking", "Parkingi i opłaty drogowe", "transport", "expense"),
    ("transport_service", "Serwis i naprawy", "transport", "expense"),
    ("health", "Zdrowie", None, "expense"),
    ("health_pharmacy", "Apteka", "health", "expense"),
    ("health_doctor", "Lekarz i wizyty", "health", "expense"),
    ("health_fitness", "Siłownia i sport", "health", "expense"),
    ("entertainment", "Rozrywka", None, "expense"),
    ("entertainment_cinema", "Kino i teatr", "entertainment", "expense"),
    ("entertainment_events", "Wydarzenia i koncerty", "entertainment", "expense"),
    ("entertainment_hobby", "Hobby", "entertainment", "expense"),
    ("shopping", "Zakupy", None, "expense"),
    ("shopping_electronics", "Elektronika", "shopping", "expense"),
    ("shopping_electronics_accessories", "Akcesoria", "shopping_electronics", "expense"),
    ("shopping_electronics_gadgets", "Sprzęt i gadżety", "shopping_electronics", "expense"),
    ("shopping_clothes", "Odzież i obuwie", "shopping", "expense"),
    ("shopping_home", "Dom i wnętrze", "shopping", "expense"),
    ("shopping_beauty", "Zdrowie i uroda", "shopping", "expense"),
    ("shopping_books", "Książki i media", "shopping", "expense"),
    ("housing", "Mieszkanie i rachunki", None, "expense"),
    ("housing_rent", "Czynsz i kredyt", "housing", "expense"),
    ("housing_bills", "Media i rachunki", "housing", "expense"),
    ("housing_internet", "Internet i telefon", "housing", "expense"),
    ("housing_maintenance", "Naprawy i wyposażenie", "housing", "expense"),
    ("subscriptions", "Subskrypcje", None, "expense"),
    ("education", "Edukacja", None, "expense"),
    ("gifts", "Prezenty i darowizny", None, "expense"),
    ("savings", "Oszczędności i inwestycje", None, "expense"),
    ("pets", "Zwierzęta", None, "expense"),
    ("pets_food", "Jedzenie dla zwierząt", "pets", "expense"),
    ("pets_vet", "Weterynarz", "pets", "expense"),
    ("cash_withdrawal", "Wypłata gotówki", None, "expense"),
    ("income", "Przychody", None, "income"),
    ("income_salary", "Wynagrodzenie", "income", "income"),
    ("income_other", "Inne przychody", "income", "income"),
    ("income_investments", "Inwestycje i dywidendy", "income", "income"),
    ("transfer_own", "Transfer między własnymi kontami", None, "transfer"),
)


def _migrate_transaction_type(connection: sqlite3.Connection) -> None:
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(transactions)")}
    if "transaction_type" not in columns:
        connection.execute("ALTER TABLE transactions ADD COLUMN transaction_type TEXT")
        rows = connection.execute("SELECT id, raw_json FROM transactions").fetchall()
        for row in rows:
            raw = json.loads(row["raw_json"])
            transaction_type = raw.get("Rodzaj operacji") or raw.get("Type") or raw.get("Transaction type")
            connection.execute(
                "UPDATE transactions SET transaction_type = ? WHERE id = ?", (transaction_type, row["id"])
            )


def _migrate_drop_legacy_tables(connection: sqlite3.Connection) -> None:
    connection.execute("DROP TABLE IF EXISTS links")
    connection.execute("DROP TABLE IF EXISTS classifications")


def _migrate_bank_dates(connection: sqlite3.Connection) -> None:
    from datetime import date
    from decimal import Decimal

    from .importers import _column, _parse_date

    connection.execute("ALTER TABLE transactions ADD COLUMN source_key TEXT")
    connection.execute("ALTER TABLE transactions ADD COLUMN bank_status TEXT NOT NULL DEFAULT 'COMPLETED'")
    for row in connection.execute("SELECT * FROM transactions").fetchall():
        raw = json.loads(row["raw_json"])
        day = date.fromisoformat(row["booking_date"])
        # Identify the export by its columns, including custom Nest account names.
        if _column(raw, "kwota", required=False) is not None:
            operation = _column(raw, "data operacji", required=False)
            if operation:
                day = _parse_date(operation)
        transaction = Transaction(
            account=row["account"],
            booking_date=day,
            amount=Decimal(row["amount"]),
            currency=row["currency"],
            description=row["description"],
            external_id=row["external_id"],
            raw=raw,
        )
        connection.execute(
            "UPDATE transactions SET booking_date=?,fingerprint=?,source_key=?,bank_status=? WHERE id=?",
            (str(day), fingerprint(transaction), source_key(transaction), bank_state(raw), row["id"]),
        )
    connection.execute("CREATE INDEX idx_transactions_source ON transactions(source_key)")


def _migrate_merchant_and_parser_version(connection: sqlite3.Connection) -> None:
    transaction_columns = {row["name"] for row in connection.execute("PRAGMA table_info(transactions)")}
    if "merchant" not in transaction_columns:
        connection.execute("ALTER TABLE transactions ADD COLUMN merchant TEXT")
    batch_columns = {row["name"] for row in connection.execute("PRAGMA table_info(import_batches)")}
    if "parser_version" not in batch_columns:
        connection.execute("ALTER TABLE import_batches ADD COLUMN parser_version INTEGER NOT NULL DEFAULT 1")


def _migrate_nest_external_id(connection: sqlite3.Connection) -> None:
    from datetime import date
    from decimal import Decimal

    from .importers import _column, derive_external_id, parse_balance

    for row in connection.execute("SELECT * FROM transactions WHERE external_id IS NULL").fetchall():
        raw = json.loads(row["raw_json"])
        # Identify Nest exports by their columns, same as the date migration above. A Polish-locale
        # Revolut export also has a "Kwota" column, so exclude it by its "Started Date" marker.
        if _column(raw, "kwota", required=False) is None or raw.get("Started Date"):
            continue
        transaction = Transaction(
            account=row["account"],
            booking_date=date.fromisoformat(row["booking_date"]),
            amount=Decimal(row["amount"]),
            currency=row["currency"],
            description=row["description"],
            external_id=derive_external_id(raw),
            balance=parse_balance(raw),
            raw=raw,
        )
        connection.execute(
            "UPDATE transactions SET external_id=?,balance=?,fingerprint=?,source_key=? WHERE id=?",
            (
                transaction.external_id,
                str(transaction.balance) if transaction.balance is not None else None,
                fingerprint(transaction),
                source_key(transaction),
                row["id"],
            ),
        )


def _migrate_category_presentation(connection: sqlite3.Connection) -> None:
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(categories)")}
    if "icon" not in columns:
        connection.execute("ALTER TABLE categories ADD COLUMN icon TEXT")
        connection.execute("ALTER TABLE categories ADD COLUMN color TEXT")
        connection.execute("ALTER TABLE categories ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0")


_MIGRATIONS: tuple[Callable[[sqlite3.Connection], None], ...] = (
    _migrate_transaction_type,
    _migrate_drop_legacy_tables,
    _migrate_bank_dates,
    _migrate_merchant_and_parser_version,
    _migrate_nest_external_id,
    _migrate_category_presentation,
)


def fingerprint(transaction: Transaction) -> str:
    parts = (
        transaction.account,
        transaction.external_id or "",
        str(transaction.booking_date),
        str(transaction.amount),
        transaction.currency,
        transaction.description,
        str((transaction.raw or {}).get("Started Date", "")),
        str((transaction.raw or {}).get("Product", "")),
        str((transaction.raw or {}).get("Type", "")),
    )
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()


def insert_transaction(connection: sqlite3.Connection, transaction: Transaction, *, commit: bool = True) -> int | None:
    raw = transaction.raw or {}
    if reconcile(connection, transaction, fingerprint(transaction)):
        if commit:
            connection.commit()
        return None
    cursor = connection.execute(
        """INSERT OR IGNORE INTO transactions
        (account, booking_date, value_date, amount, currency, description, merchant, counterparty, external_id,
         transaction_type, balance, raw_json, fingerprint, source_key, bank_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            transaction.account,
            str(transaction.booking_date),
            str(transaction.value_date) if transaction.value_date else None,
            str(transaction.amount),
            transaction.currency,
            transaction.description,
            transaction.merchant,
            transaction.counterparty,
            transaction.external_id,
            transaction.transaction_type
            or raw.get("Rodzaj operacji")
            or raw.get("Type")
            or raw.get("Transaction type"),
            str(transaction.balance) if transaction.balance is not None else None,
            json.dumps(raw, ensure_ascii=False),
            fingerprint(transaction),
            source_key(transaction),
            bank_state(raw),
        ),
    )
    if commit:
        connection.commit()
    return cursor.lastrowid if cursor.rowcount else None


class Database:
    def __init__(self, path: Path) -> None:
        if path.exists() and path.stat().st_size:
            from .recovery import backup_database

            backup_database(path, "startup", daily=True)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA busy_timeout=5000")
        self.connection.executescript(SCHEMA)
        self._apply_migrations()
        self.connection.executemany(
            "INSERT OR IGNORE INTO categories(key, label, parent_key, kind) VALUES (?, ?, ?, ?)", CATEGORIES
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def _apply_migrations(self) -> None:
        current_version = self.connection.execute("PRAGMA user_version").fetchone()[0]
        for index, migration in enumerate(_MIGRATIONS):
            if index < current_version:
                continue
            migration(self.connection)
            self.connection.execute(f"PRAGMA user_version = {index + 1}")
        self.connection.commit()

    def insert_transaction(self, transaction: Transaction) -> int | None:
        return insert_transaction(self.connection, transaction)

    def insert_transactions(self, transactions: list[Transaction], *, commit: bool = True) -> tuple[int, int]:
        inserted = skipped = 0
        with self.connection if commit else nullcontext():
            for transaction in transactions:
                if insert_transaction(self.connection, transaction, commit=False) is None:
                    skipped += 1
                else:
                    inserted += 1
        return inserted, skipped
