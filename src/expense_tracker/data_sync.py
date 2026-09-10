from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from .csv_utils import read_csv
from .database import Database
from .importers import detect_format, import_nest_csv, import_revolut_csv
from .ledger import apply_rules

IMPORTERS = {
    "nest": lambda path: import_nest_csv(path, account="nest"),
    "revolut": lambda path: import_revolut_csv(path, account="revolut"),
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
    known_hashes = {row["file_hash"] for row in database.connection.execute("SELECT file_hash FROM import_batches")}
    any_rule_may_apply = False
    for path in sorted(data_dir.glob("*.csv")):
        file_hash = _file_hash(path)
        if file_hash in known_hashes:
            result.skipped_files.append(path.name)
            continue
        try:
            headers, _ = read_csv(path)
            file_format = detect_format(headers)
            if file_format is None:
                result.unsupported_files.append(path.name)
                continue
            found = IMPORTERS[file_format](path)
            inserted, skipped = database.insert_transactions(found)
        except ValueError as exc:
            result.error_files.append((path.name, str(exc)))
            continue
        database.connection.execute(
            """INSERT INTO import_batches
            (file_name, file_hash, importer, rows_found, rows_inserted, rows_skipped_duplicate)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (path.name, file_hash, file_format, len(found), inserted, skipped),
        )
        database.connection.commit()
        result.new_files.append(path.name)
        result.transactions_inserted += inserted
        any_rule_may_apply = True
    if any_rule_may_apply:
        apply_rules(database.connection)
    return result
