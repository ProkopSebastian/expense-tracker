from __future__ import annotations

from pathlib import Path

from expense_tracker.data_sync import import_file, sync_data_directory
from expense_tracker.database import Database
from expense_tracker.ledger import merchant_key, transactions

NEST_CSV = (
    "Data księgowania;Data operacji;Rodzaj operacji;Kwota;Waluta;Dane kontrahenta;Tytuł operacji;Saldo po operacji\n"
    "10-09-2026;10-09-2026;Płatności kartą;-12,50;PLN;Sklep;MR.ROLLO WARSZAWA Nr karty 4724;100,00\n"
)


def test_sync_skips_already_processed_file_by_hash(tmp_path: Path, database: Database) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "export.csv").write_text(NEST_CSV, encoding="utf-8")

    first = sync_data_directory(database, data_dir)
    assert first.transactions_inserted == 1
    assert first.new_files == ["export.csv"]

    second = sync_data_directory(database, data_dir)
    assert second.transactions_inserted == 0
    assert second.new_files == []
    assert second.skipped_files == ["export.csv"]


def test_sync_reports_unsupported_format_without_blocking_others(tmp_path: Path, database: Database) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "good.csv").write_text(NEST_CSV, encoding="utf-8")
    (data_dir / "gibberish.csv").write_text("foo,bar\n1,2\n", encoding="utf-8")

    result = sync_data_directory(database, data_dir)

    assert "good.csv" in result.new_files
    assert "gibberish.csv" in result.unsupported_files
    assert result.transactions_inserted == 1


def test_sync_applies_merchant_rules_after_import(tmp_path: Path, database: Database) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "export.csv").write_text(NEST_CSV, encoding="utf-8")

    key = merchant_key("MR.ROLLO WARSZAWA Nr karty 4724")
    database.connection.execute(
        "INSERT INTO merchant_rules(merchant_key, category_key) VALUES (?, 'food_restaurants')", (key,)
    )
    database.connection.commit()

    sync_data_directory(database, data_dir)

    row = transactions(database.connection)[0]
    assert row["category_key"] == "food_restaurants"
    assert row["decision_source"] == "rule"


def test_reprocesses_an_older_parser_version_without_duplicating_rows(tmp_path: Path, database: Database) -> None:
    path = tmp_path / "export.csv"
    path.write_text(NEST_CSV, encoding="utf-8")
    assert import_file(database, path) == 1
    database.connection.execute("UPDATE transactions SET merchant=NULL")
    database.connection.execute("UPDATE import_batches SET parser_version=1")
    database.connection.commit()

    assert import_file(database, path) == 0
    [row] = transactions(database.connection)
    assert row["merchant"] == "MR.ROLLO WARSZAWA Nr karty 4724"
    assert database.connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 1
