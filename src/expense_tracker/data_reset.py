from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path
from uuid import uuid4

_FINANCIAL_TABLES = (
    "case_members",
    "suggestions",
    "transaction_decisions",
    "merchant_rules",
    "cases",
    "import_batches",
    "transactions",
)


def _owned_directories(database_path: Path, data_dir: Path) -> tuple[Path, Path]:
    runtime_dir = database_path.resolve().parent
    expected_data = runtime_dir / "data"
    resolved_data = data_dir.resolve()
    if resolved_data != expected_data or data_dir.is_symlink():
        raise ValueError(
            "Reset został przerwany, ponieważ folder danych nie jest standardowym folderem aplikacji."
        )
    backups = runtime_dir / f"{database_path.stem}-backups"
    return expected_data, backups


def reset_financial_data(database_path: Path, data_dir: Path) -> None:
    data, backups = _owned_directories(database_path, data_dir)
    staged: list[tuple[Path, Path]] = []
    try:
        for source in (data, backups):
            if not source.exists():
                continue
            if not source.is_dir() or source.is_symlink():
                raise ValueError("Reset został przerwany z powodu nietypowej struktury folderów aplikacji.")
            target = source.with_name(f".{source.name}-reset-{uuid4().hex}")
            source.replace(target)
            staged.append((source, target))

        connection = sqlite3.connect(database_path)
        try:
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA busy_timeout=5000")
            with connection:
                for table in _FINANCIAL_TABLES:
                    connection.execute(f'DELETE FROM "{table}"')
                if connection.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
                ).fetchone():
                    connection.execute("DELETE FROM sqlite_sequence")
        finally:
            connection.close()
    except Exception:
        for source, target in reversed(staged):
            if target.exists() and not source.exists():
                target.replace(source)
        raise

    data.mkdir(mode=0o700, parents=True, exist_ok=True)
    for _, target in staged:
        shutil.rmtree(target)
