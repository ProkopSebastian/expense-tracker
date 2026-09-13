from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path

from .database import Database, fingerprint
from .import_identity import source_key
from .importers import (
    detect_file_format,
    import_erste_csv,
    import_ing_pdf,
    import_nest_csv,
    import_revolut_csv,
    import_velo_pdf,
)
from .ledger import apply_rules

IMPORTERS = {
    "nest": import_nest_csv,
    "revolut": partial(import_revolut_csv, include_inactive=True),
    "erste": import_erste_csv,
    "ing_pdf": import_ing_pdf,
    "velo_pdf": import_velo_pdf,
}
SUPPORTED_SUFFIXES = {".csv", ".pdf"}
DEFAULT_ACCOUNTS = {
    "nest": "nest",
    "revolut": "revolut",
    "erste": "erste",
    "ing_pdf": "ing",
    "velo_pdf": "velo",
}
PARSER_VERSION = 3


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
    for path in sorted(
        (entry for entry in data_dir.iterdir() if entry.is_file() and entry.suffix.casefold() in SUPPORTED_SUFFIXES),
        key=lambda entry: entry.name.casefold(),
    ):
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
    bank = detect_file_format(path)
    if bank is None:
        raise ValueError("Nie rozpoznano formatu banku. Obsługiwane: Nest, Revolut, Erste, ING PDF i Velo PDF.")
    default_account = DEFAULT_ACCOUNTS[bank]
    account = account or default_account
    original_hash = _file_hash(path)
    file_hash = (
        original_hash
        if account == default_account
        else hashlib.sha256(f"{account}:{original_hash}".encode()).hexdigest()
    )
    existing_batch = database.connection.execute(
        "SELECT parser_version FROM import_batches WHERE file_hash=?", (file_hash,)
    ).fetchone()
    if existing_batch and int(existing_batch["parser_version"]) >= PARSER_VERSION:
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
            (file_name,file_hash,importer,rows_found,rows_inserted,rows_skipped_duplicate,parser_version)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(file_hash) DO UPDATE SET
                file_name=excluded.file_name, importer=excluded.importer, rows_found=excluded.rows_found,
                rows_inserted=excluded.rows_inserted, rows_skipped_duplicate=excluded.rows_skipped_duplicate,
                parser_version=excluded.parser_version, imported_at=CURRENT_TIMESTAMP""",
            (path.name, file_hash, bank, len(found), inserted, skipped, PARSER_VERSION),
        )
    return inserted
