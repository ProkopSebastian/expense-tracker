from __future__ import annotations

import json
import shutil
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from uuid import uuid4
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from .database import _MIGRATIONS, Database
from .version import VERSION

FORMAT = 1
MANIFEST = "manifest.json"
DATABASE = "expense-tracker.sqlite3"
APPEARANCE = "appearance.json"
DATA = "data"
# Restoring keeps a few archives of what it replaced; older ones are covered by later restores.
KEPT_SAFETY_ARCHIVES = 3


@dataclass(frozen=True)
class DataSummary:
    transactions: int
    last_transaction: str | None
    files: int


@dataclass(frozen=True)
class BackupInfo:
    created_at: str
    app_version: str
    contents: DataSummary


def summarize(database_path: Path, data_dir: Path) -> DataSummary:
    with closing(sqlite3.connect(database_path)) as connection:
        transactions, last = connection.execute("SELECT COUNT(*), MAX(booking_date) FROM transactions").fetchone()
    files = sum(1 for file in data_dir.rglob("*") if file.is_file()) if data_dir.is_dir() else 0
    return DataSummary(transactions=transactions, last_transaction=last, files=files)


def archive_name(moment: datetime | None = None) -> str:
    return f"Wydatki-kopia-{(moment or datetime.now()).strftime('%Y-%m-%d')}.zip"


def write_archive(database_path: Path, data_dir: Path, configuration_dir: Path, target: Path) -> None:
    # The SQLite backup API gives a consistent copy even while the live database runs in WAL mode.
    with TemporaryDirectory() as directory:
        snapshot = Path(directory) / DATABASE
        with closing(sqlite3.connect(database_path)) as source, closing(sqlite3.connect(snapshot)) as copy:
            source.backup(copy)
            copy.execute("PRAGMA journal_mode=DELETE")
            schema = copy.execute("PRAGMA user_version").fetchone()[0]
        manifest = {
            "format": FORMAT,
            "app_version": VERSION,
            "schema_version": schema,
            "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        }
        temporary = target.with_name(f".{target.name}.{uuid4().hex}.tmp")
        try:
            with ZipFile(temporary, "w", ZIP_DEFLATED) as archive:
                archive.writestr(MANIFEST, json.dumps(manifest))
                archive.write(snapshot, DATABASE)
                appearance = configuration_dir / APPEARANCE
                if appearance.is_file():
                    archive.write(appearance, APPEARANCE)
                if data_dir.is_dir():
                    for file in sorted(data_dir.rglob("*")):
                        if file.is_file() and not file.is_symlink():
                            archive.write(file, f"{DATA}/{file.relative_to(data_dir).as_posix()}")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)


def _data_member(name: str) -> PurePosixPath | None:
    path = PurePosixPath(name)
    if path.parts[:1] != (DATA,) or len(path.parts) < 2 or name.endswith("/"):
        return None
    if path.is_absolute() or ".." in path.parts or "\\" in name:
        raise ValueError("Kopia zawiera nieprawidłową ścieżkę pliku.")
    return path.relative_to(DATA)


def _unpack(archive_path: Path, workspace: Path) -> dict:
    try:
        with ZipFile(archive_path) as archive:
            names = archive.namelist()
            if MANIFEST not in names or DATABASE not in names:
                raise ValueError("To nie jest plik kopii Wydatków.")
            try:
                manifest = json.loads(archive.read(MANIFEST))
                schema, format_version = int(manifest["schema_version"]), int(manifest["format"])
            except KeyError, TypeError, ValueError:
                raise ValueError("Opis kopii jest uszkodzony.") from None
            if format_version > FORMAT or schema > len(_MIGRATIONS):
                raise ValueError(
                    f"Kopia pochodzi z nowszej wersji Wydatków ({manifest.get('app_version', '?')}). "
                    "Zaktualizuj aplikację i spróbuj ponownie."
                )
            for name in names:
                member = _data_member(name)
                if name in (DATABASE, APPEARANCE) or member is not None:
                    target = workspace.joinpath(*PurePosixPath(name).parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.read(name))
    except BadZipFile, OSError:
        raise ValueError("To nie jest plik kopii Wydatków.") from None
    database = workspace / DATABASE
    try:
        with closing(sqlite3.connect(database)) as connection:
            healthy = connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            stored = connection.execute("PRAGMA user_version").fetchone()[0]
            has_ledger = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='transactions'"
            ).fetchone()
    except sqlite3.DatabaseError:
        healthy = False
    if not healthy or not has_ledger or stored != schema:
        raise ValueError("Baza w kopii jest uszkodzona.")
    # A copy from an older version is brought up to date here, before anything live is touched.
    Database(database).close()
    return manifest


def inspect_archive(archive_path: Path) -> BackupInfo:
    with TemporaryDirectory() as directory:
        workspace = Path(directory)
        manifest = _unpack(archive_path, workspace)
        contents = summarize(workspace / DATABASE, workspace / DATA)
    return BackupInfo(
        created_at=str(manifest.get("created_at", "")),
        app_version=str(manifest.get("app_version", "")),
        contents=contents,
    )


def restore_archive(archive_path: Path, database_path: Path, data_dir: Path, configuration_dir: Path) -> Path:
    # Unlike a reset, nothing is lost here: the current folder goes into the safety archive first.
    if data_dir.is_symlink() or (data_dir.exists() and not data_dir.is_dir()):
        raise ValueError("Folder danych ma nietypową budowę, więc dane nie zostały zmienione.")
    data = data_dir.resolve()
    backups = database_path.parent / f"{database_path.stem}-backups"
    with TemporaryDirectory() as directory:
        workspace = Path(directory)
        _unpack(archive_path, workspace)
        backups.mkdir(mode=0o700, parents=True, exist_ok=True)
        safety = backups / f"przed-przywroceniem-{datetime.now().strftime('%Y-%m-%d-%H%M%S')}.zip"
        write_archive(database_path, data, configuration_dir, safety)

        # Statements are staged beside the live folder, so swapping them is a rename on one disk.
        staged = data.with_name(f".{data.name}-restore-{uuid4().hex}")
        replaced = data.with_name(f".{data.name}-replaced-{uuid4().hex}")
        if (workspace / DATA).is_dir():
            shutil.copytree(workspace / DATA, staged)
        else:
            staged.mkdir(mode=0o700)
        if data.exists():
            data.replace(replaced)
        staged.replace(data)
        try:
            # One backup step copies every page under a single lock, so readers see the old data or
            # the new, never a mix.
            with (
                closing(sqlite3.connect(workspace / DATABASE)) as source,
                closing(sqlite3.connect(database_path)) as live,
            ):
                live.execute("PRAGMA busy_timeout=5000")
                source.backup(live)
        except BaseException:
            shutil.rmtree(data)
            if replaced.exists():
                replaced.replace(data)
            raise

        appearance = workspace / APPEARANCE
        if appearance.is_file():
            temporary = configuration_dir / f".{APPEARANCE}.tmp"
            shutil.copyfile(appearance, temporary)
            temporary.replace(configuration_dir / APPEARANCE)
    # The last action's undo copy describes the replaced data, so undoing it would bring that back.
    (backups / "undo.json").unlink(missing_ok=True)
    if replaced.exists():
        shutil.rmtree(replaced)
    for old in sorted(backups.glob("przed-przywroceniem-*.zip"))[:-KEPT_SAFETY_ARCHIVES]:
        old.unlink()
    return safety
