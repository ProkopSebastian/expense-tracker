from __future__ import annotations

from pathlib import Path

from expense_tracker.csv_utils import read_csv
from expense_tracker.data_sync import import_file
from expense_tracker.database import Database
from expense_tracker.import_identity import source_key
from expense_tracker.importers import detect_format, import_revolut_csv

REVOLUT_CSV = (
    "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n"
    "Deposit,Current,2026-09-09 22:27:16,2026-09-09 22:27:17,Apple Pay deposit,500.00,0.00,PLN,COMPLETED,700.00\n"
    "Card Payment,Current,2026-09-09 22:28:34,,EasyJet,-450.00,0.00,PLN,PENDING,\n"
    "Card Payment,Current,2026-09-10 08:00:00,2026-09-10 08:00:01,Refused shop,-20.00,0.00,PLN,DECLINED,680.00\n"
)

REVOLUT_PL_CSV = (
    "Rodzaj,Produkt,Data rozpoczęcia,Data zrealizowania,Opis,Kwota,Opłata,Waluta,State,Saldo\n"
    "Płatność kartą,Bieżące,2026-09-09 10:00:00,2026-09-09 10:00:01,Kawiarnia,-12.50,0.00,PLN,ZAKOŃCZONO,87.50\n"
    "Płatność kartą,Bieżące,2026-09-10 10:00:00,2026-09-10 10:00:01,Sklep,-20.00,0.00,PLN,COFNIĘTO,87.50\n"
)


def test_imports_revolut_export_pending_and_completed_rows(tmp_path: Path) -> None:
    export = tmp_path / "revolut.csv"
    export.write_text(REVOLUT_CSV, encoding="utf-8")

    transactions = import_revolut_csv(export)

    assert len(transactions) == 2
    completed, pending = transactions
    assert str(completed.booking_date) == "2026-09-09"
    assert str(completed.value_date) == "2026-09-09"
    assert str(completed.amount) == "500.00"
    assert str(completed.balance) == "700.00"
    assert pending.description == "EasyJet"
    assert str(pending.amount) == "-450.00"
    assert pending.value_date is None
    assert pending.balance is None


def test_declined_rows_are_skipped(tmp_path: Path) -> None:
    export = tmp_path / "revolut.csv"
    export.write_text(REVOLUT_CSV, encoding="utf-8")

    transactions = import_revolut_csv(export)

    assert all(transaction.description != "Refused shop" for transaction in transactions)


def test_detect_format_distinguishes_nest_and_revolut_headers(tmp_path: Path) -> None:
    revolut = tmp_path / "revolut.csv"
    revolut.write_text(REVOLUT_CSV, encoding="utf-8")
    headers, _ = read_csv(revolut)
    assert detect_format(headers) == "revolut"

    nest = tmp_path / "nest.csv"
    nest.write_text(
        "Data księgowania;Data operacji;Rodzaj operacji;Kwota;Waluta;Tytuł operacji\n"
        "10-09-2026;10-09-2026;Płatności kartą;-10,00;PLN;Kawa\n",
        encoding="utf-8",
    )
    headers, _ = read_csv(nest)
    assert detect_format(headers) == "nest"

    assert detect_format(["Foo", "Bar", "Baz"]) is None


def test_imports_polish_revolut_headers_and_normalizes_states(tmp_path: Path) -> None:
    export = tmp_path / "revolut-pl.csv"
    export.write_text(REVOLUT_PL_CSV, encoding="utf-8")
    headers, _ = read_csv(export)

    assert detect_format(headers) == "revolut"
    [completed] = import_revolut_csv(export)
    all_rows = import_revolut_csv(export, include_inactive=True)

    assert completed.description == "Kawiarnia"
    assert completed.raw["Started Date"] == "2026-09-09 10:00:00"
    assert completed.raw["State"] == "COMPLETED"
    assert all_rows[1].raw["State"] == "REVERTED"


def test_revolut_identity_does_not_depend_on_export_language(tmp_path: Path) -> None:
    english = tmp_path / "revolut-en.csv"
    polish = tmp_path / "revolut-pl.csv"
    english.write_text(
        "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n"
        "Card Payment,Current,2026-09-09 10:00:00,2026-09-09 10:00:01,Cafe,-12.50,0.00,PLN,COMPLETED,87.50\n",
        encoding="utf-8",
    )
    polish.write_text(
        "Rodzaj,Produkt,Data rozpoczęcia,Data zrealizowania,Opis,Kwota,Opłata,Waluta,State,Saldo\n"
        "Płatność kartą,Bieżące,2026-09-09 10:00:00,2026-09-09 10:00:01,Kawiarnia,-12.50,0.00,PLN,ZAKOŃCZONO,87.50\n",
        encoding="utf-8",
    )

    [english_row] = import_revolut_csv(english)
    polish_row = import_revolut_csv(polish)[0]

    assert source_key(english_row) == source_key(polish_row)
    database = Database(tmp_path / "expenses.sqlite3")
    try:
        assert import_file(database, english) == 1
        assert import_file(database, polish) == 0
        assert database.connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 1
    finally:
        database.close()
