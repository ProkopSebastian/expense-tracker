"""SQLite-consistent backups and guarded, single-step undo of local writes."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


def backup_database(path: Path, label: str, *, daily: bool = False) -> Path:
    directory = path.parent / f"{path.stem}-backups"
    directory.mkdir(parents=True, exist_ok=True)
    directory.chmod(0o700)
    stamp = datetime.now(UTC).strftime("%Y%m%d" if daily else "%Y%m%d-%H%M%S-%f")
    target = directory / f"{label}-{stamp}.sqlite3"
    if target.exists():
        return target
    temporary = directory / f".{uuid4().hex}.tmp"
    try:
        with closing(sqlite3.connect(path)) as source, closing(sqlite3.connect(temporary)) as destination:
            source.backup(destination)
        temporary.chmod(0o600)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    # Startup and action backups have independent retention.
    manifest = directory / "undo.json"
    protected = json.loads(manifest.read_text()).get("backup") if manifest.exists() else None
    for old in sorted(directory.glob(f"{label}-*.sqlite3"))[:-30]:
        if old.name != protected:
            old.unlink()
            _unlink_wal_sidecars(old)
    _cleanup_orphaned_wal_sidecars(directory)
    return target


def _unlink_wal_sidecars(backup: Path) -> None:
    # sqlite3.Connection.backup() copies the WAL journal mode header, so opening a
    # backup file for read/write (undo_last, digest) can leave -wal/-shm siblings
    # behind that a plain "*.sqlite3" rotation glob never matches.
    for suffix in ("-wal", "-shm"):
        backup.with_name(backup.name + suffix).unlink(missing_ok=True)


def _cleanup_orphaned_wal_sidecars(directory: Path) -> None:
    for suffix in ("-wal", "-shm"):
        for sidecar in directory.glob(f"*.sqlite3{suffix}"):
            if not sidecar.with_name(sidecar.name[: -len(suffix)]).exists():
                sidecar.unlink()


def digest(connection: sqlite3.Connection) -> str:
    value = hashlib.sha256()
    for statement in connection.iterdump():
        value.update(statement.encode())
    return value.hexdigest()


ACTION_LABELS: dict[tuple[str, str], str] = {
    ("POST", "/api/transactions"): "Dodanie transakcji ręcznej",
    ("PUT", "/api/transactions/{}/category"): "Zmiana kategorii transakcji",
    ("POST", "/api/cases"): "Utworzenie grupy transakcji",
    ("DELETE", "/api/cases/{}"): "Rozwiązanie grupy transakcji",
    ("POST", "/api/suggestions/{}/approve"): "Zatwierdzenie sugestii",
    ("POST", "/api/suggestions/{}/reject"): "Odrzucenie sugestii",
    ("PUT", "/api/rules/{}"): "Zmiana reguły sprzedawcy",
    ("DELETE", "/api/rules/{}"): "Usunięcie reguły sprzedawcy",
    ("POST", "/api/sync"): "Synchronizacja katalogu danych",
    ("POST", "/api/ai/merchants"): "Analiza AI sprzedawców",
    ("POST", "/api/ai/relations"): "Analiza AI powiązań",
    ("POST", "/api/import"): "Import wyciągu",
    ("PUT", "/api/settings/ai"): "Zmiana ustawień AI",
}


def describe_action(method: str, path: str) -> str:
    """Human-readable Polish label for what a mutating request did, for the undo notice."""
    generic = "/".join("{}" if segment.isdigit() else segment for segment in path.split("/"))
    label = ACTION_LABELS.get((method, generic))
    return label or f"Zmiana danych ({method} {path})"


def record_undo(path: Path, backup: Path, label: str) -> None:
    with closing(sqlite3.connect(path)) as current, closing(sqlite3.connect(backup)) as previous:
        after = digest(current)
        if after == digest(previous):
            return
    manifest = backup.parent / "undo.json"
    temporary = manifest.with_suffix(".tmp")
    temporary.write_text(json.dumps({"backup": backup.name, "after": after, "label": label}))
    temporary.chmod(0o600)
    temporary.replace(manifest)


def undo_available(path: Path) -> dict[str, object]:
    manifest = path.parent / f"{path.stem}-backups" / "undo.json"
    if not manifest.exists():
        return {"can_undo": False, "label": None}
    info = json.loads(manifest.read_text())
    available = (manifest.parent / Path(info["backup"]).name).is_file()
    return {"can_undo": available, "label": info.get("label") if available else None}


def undo_last(path: Path) -> None:
    directory = path.parent / f"{path.stem}-backups"
    manifest = directory / "undo.json"
    if not manifest.exists():
        raise ValueError("Brak zmiany do cofnięcia.")
    info = json.loads(manifest.read_text())
    backup = directory / Path(info["backup"]).name
    if not backup.is_file():
        raise ValueError("Kopia do cofnięcia nie jest dostępna.")
    with closing(sqlite3.connect(path)) as db, closing(sqlite3.connect(backup)) as previous, db:
        db.execute("PRAGMA busy_timeout=5000")
        db.execute("BEGIN IMMEDIATE")
        if digest(db) != info["after"]:
            raise ValueError("Baza zmieniła się poza aplikacją. Automatyczne cofnięcie nie jest już bezpieczne.")
        tables = [
            row[0]
            for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        ]
        # Foreign keys are off on this dedicated connection; restore the complete snapshot atomically.
        for table in tables:
            quoted = '"' + table.replace('"', '""') + '"'
            db.execute(f"DELETE FROM {quoted}")
            rows = previous.execute(f"SELECT * FROM {quoted}").fetchall()
            if rows:
                placeholders = ",".join("?" for _ in rows[0])
                db.executemany(f"INSERT INTO {quoted} VALUES ({placeholders})", rows)
        if db.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Kopia jest niespójna. Cofnięcie zostało przerwane.")
    manifest.unlink()
