from pathlib import Path

from expense_tracker.importers import import_nest_csv


def test_imports_nest_export_with_metadata_preamble(tmp_path: Path) -> None:
    export = tmp_path / "nest.csv"
    export.write_text(
        "Numer rachunku: 123\nWłaściciel: Jan Kowalski\n"
        "Data księgowania;Data operacji;Rodzaj operacji;Kwota;Waluta;Dane kontrahenta;"
        "Tytuł operacji;Saldo po operacji\n"
        "10-09-2026;09-09-2026;Płatności kartą;-12,50;PLN;Sklep;Obiad;100,00\n",
        encoding="utf-8",
    )

    [transaction] = import_nest_csv(export)

    assert str(transaction.booking_date) == "2026-09-10"
    assert str(transaction.value_date) == "2026-09-09"
    assert str(transaction.amount) == "-12.50"
    assert transaction.description == "Obiad"
