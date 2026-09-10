from __future__ import annotations

from pathlib import Path

from expense_tracker.csv_utils import read_csv
from expense_tracker.importers import detect_format, import_revolut_csv

REVOLUT_CSV = (
    "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n"
    "Deposit,Current,2026-09-09 22:27:16,2026-09-09 22:27:17,Apple Pay deposit,500.00,0.00,PLN,COMPLETED,700.00\n"
    "Card Payment,Current,2026-09-09 22:28:34,,EasyJet,-450.00,0.00,PLN,PENDING,\n"
    "Card Payment,Current,2026-09-10 08:00:00,2026-09-10 08:00:01,Refused shop,-20.00,0.00,PLN,DECLINED,680.00\n"
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
