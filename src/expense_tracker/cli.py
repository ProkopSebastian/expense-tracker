from __future__ import annotations

import argparse
from pathlib import Path

from .config import settings
from .csv_utils import read_csv
from .data_sync import sync_data_directory
from .database import Database
from .importers import import_nest_csv, import_revolut_csv
from .matching import own_transfer_candidates


def _database_path(value: str) -> Path:
    return Path(value).expanduser()


def main() -> None:
    parser = argparse.ArgumentParser(prog="expense-tracker", description="Lokalna analiza wydatków")
    parser.add_argument(
        "--database",
        type=_database_path,
        default=settings.database_path,
        help="plik SQLite (domyślnie: expense-tracker.sqlite3)",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect", help="pokaż nagłówki i pierwsze wiersze CSV")
    inspect.add_argument("file", type=Path)
    import_nest = commands.add_parser("import-nest", help="zaimportuj eksport CSV Nest Bank")
    import_nest.add_argument("file", type=Path)
    import_nest.add_argument(
        "--account",
        default="nest",
        help="identyfikator konta; użyj innego dla drugiego konta Nest",
    )
    import_revolut = commands.add_parser("import-revolut", help="zaimportuj eksport CSV Revolut")
    import_revolut.add_argument("file", type=Path)
    import_revolut.add_argument(
        "--account",
        default="revolut",
        help="identyfikator konta; użyj innego dla drugiego konta Revolut",
    )
    commands.add_parser("sync", help="zaimportuj wszystkie nowe pliki z katalogu data/")
    candidates = commands.add_parser("transfer-candidates", help="pokaż kandydatów na przelewy własne")
    candidates.add_argument("--days", type=int, default=3, help="maksymalna różnica dat")
    args = parser.parse_args()

    if args.command == "inspect":
        headers, rows = read_csv(args.file)
        print("Nagłówki:", " | ".join(headers))
        print(f"Wiersze: {len(rows)}")
        for row in rows[:3]:
            print(row)
        return

    database = Database(args.database)
    try:
        if args.command == "import-nest":
            imported, skipped = database.insert_transactions(import_nest_csv(args.file, args.account))
            print(f"Import zakończony: dodano {imported}, pominięto duplikaty {skipped}.")
        elif args.command == "import-revolut":
            imported, skipped = database.insert_transactions(import_revolut_csv(args.file, args.account))
            print(f"Import zakończony: dodano {imported}, pominięto duplikaty {skipped}.")
        elif args.command == "sync":
            result = sync_data_directory(database, settings.data_dir)
            print(f"Nowe pliki: {len(result.new_files)}, pominięte (już wczytane): {len(result.skipped_files)}.")
            print(f"Dodano transakcji: {result.transactions_inserted}.")
            for name in result.unsupported_files:
                print(f"Nierozpoznany format: {name}")
            for name, error in result.error_files:
                print(f"Błąd w pliku {name}: {error}")
        elif args.command == "transfer-candidates":
            results = own_transfer_candidates(database.connection, args.days)
            if not results:
                print("Brak kandydatów.")
            for candidate in results:
                print(
                    f"{candidate.transaction_id} ↔ {candidate.other_transaction_id} "
                    f"| {candidate.score:.0%} | {candidate.reason}"
                )
    finally:
        database.close()
