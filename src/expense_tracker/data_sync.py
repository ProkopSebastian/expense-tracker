from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path

from .csv_utils import read_csv
from .database import Database, fingerprint
from .import_identity import source_key
from .importers import detect_format, import_nest_csv, import_revolut_csv
from .ledger import apply_rules

IMPORTERS = {
    "nest": import_nest_csv,
    "revolut": partial(import_revolut_csv, include_inactive=True),
}


@dataclass
class SyncResult:
    new_files: list[str] = field(default_factory=list)
    skipped_files: list[str] = field(default_factory=list)
    unsupported_files: list[str] = field(default_factory=list)
    error_files: list[tuple[str, str]] = field(default_factory=list)
    transactions_inserted: int = 0


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sync_data_directory(database: Database, data_dir: Path) -> SyncResult:
    result = SyncResult()
    if not data_dir.is_dir():
        return result
    for path in sorted(data_dir.glob("*.csv")):
        try:
            result_one = import_file(database, path)
        except ValueError as exc:
            if "Nie rozpoznano formatu banku" in str(exc):
                result.unsupported_files.append(path.name)
            else:
                result.error_files.append((path.name, str(exc)))
            continue
        if result_one is None:
            result.skipped_files.append(path.name)
        else:
            result.new_files.append(path.name)
            result.transactions_inserted += result_one
    return result


def import_file(database: Database, path: Path, account: str | None = None) -> int | None:
    """Import one export atomically; account separates multiple accounts at the same bank."""
    headers, _ = read_csv(path)
    bank = detect_format(headers)
    if bank is None:
        raise ValueError("Nie rozpoznano formatu banku. Obsługiwane: Nest i Revolut.")
    account = account or bank
    original_hash = _file_hash(path)
    file_hash = original_hash if account == bank else hashlib.sha256(f"{account}:{original_hash}".encode()).hexdigest()
    if database.connection.execute("SELECT 1 FROM import_batches WHERE file_hash=?", (file_hash,)).fetchone():
        return None
    found = IMPORTERS[bank](path, account=account)
    identities: dict[str, str] = {}
    for transaction in found:
        key = source_key(transaction)
        if key and not transaction.external_id:
            signature = fingerprint(transaction)
            if key in identities and identities[key] != signature:
                raise ValueError(
                    "Eksport zawiera różne operacje z identycznym czasem i typem. "
                    "Potrzebny eksport z identyfikatorami transakcji."
                )
            identities[key] = signature
    with database.connection:
        inserted, skipped = database.insert_transactions(found, commit=False)
        apply_rules(database.connection, commit=False)
        database.connection.execute(
            """INSERT INTO import_batches
            (file_name,file_hash,importer,rows_found,rows_inserted,rows_skipped_duplicate)
            VALUES (?,?,?,?,?,?)""",
            (path.name, file_hash, bank, len(found), inserted, skipped),
        )
    return inserted
