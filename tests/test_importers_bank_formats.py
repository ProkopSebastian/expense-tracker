from __future__ import annotations

from pathlib import Path

import pytest

from expense_tracker.importers import (
    _parse_ing_pdf_text,
    _parse_velo_pdf_text,
    detect_file_format,
    import_erste_csv,
)

ERSTE_CSV = (
    '2026-09-12,01-08-2026,"00 0000 0000 0000 0000 0000 0000",Test User,PLN,"100,00","115,00",2,\n'
    '03-08-2026,02-08-2026,TR. KART 1234 PŁATNOŚĆ KARTĄ 10.00 PLN TEST SHOP * REF,,,"-10,00","90,00",2,\n'
    '04-08-2026,04-08-2026,Incoming transfer,Test Sender,"11 1111 1111 1111 1111 1111 1111",'
    '"25,00","115,00",1,\n'
)

VELO_TEXT = """
VeloBank S.A.
Waluta rachunku: PLN
Data księgowania
Data transakcji
Opis transakcji
Kwota transakcji w PLN
Saldo po transakcji w PLN
2026.08.03
2026.07.31
Operacja kartą 1234 xxxx 5678 na kwotę 27,00 PLN w TEST SHOP, WARSZAWA, POL
-27,00
344,33
2026.08.05
2026.08.05
Przelew przychodzący zewnętrzny Z rachunku: 00 0000 0000 0000
Prowadzonego na rzecz: Test Sender Tytułem: Zwrot
45,58
389,91
"""

ING_TEXT = """
ING Bank Śląski S.A.
Wyciąg z rachunku
Suma uznań (1)
Suma obciążeń (1)
Data księgowania / Data transakcji
Dane kontrahenta
Tytuł
Szczegóły / nr transakcji
Kwota
12.08.2026
12.08.2026
Nazwa i adres płatnika: TEST SENDER
Nagroda - test
202622497705026086 50,00 PLN
17.08.2026
15.08.2026
Nazwa i adres odbiorcy: TEST SHOP
Płatność kartą
TR.KART
202622997304293016 -24,99 PLN
"""

VELO_REFUND_TEXT = """
VeloBank S.A.
2026.08.07
2026.08.05
Zwrot operacji kartą 1234 xxxx 5678 na kwotę 20,00 PLN w TEST SHOP, WARSZAWA, POL
20,00
120,00
"""

VELO_PHONE_TRANSFER_TEXT = """
VeloBank S.A.
Waluta rachunku: PLN
2026.08.08
2026.08.08
Przelew przychodzący zewnętrzny Z rachunku:
PL71124050801111001101319248
Prowadzonego na rzecz: ZUZANNA
CZYŻOWSKA Tytułem: Przelew na telefon
48693***734. Przelew na telefon
100,00
220,00
"""


def test_imports_headerless_erste_csv(tmp_path: Path) -> None:
    path = tmp_path / "erste.csv"
    path.write_text(ERSTE_CSV, encoding="utf-8")

    assert detect_file_format(path) == "erste"
    rows = import_erste_csv(path, account="Erste test")

    assert len(rows) == 2
    assert str(rows[0].booking_date) == "2026-08-03"
    assert str(rows[0].value_date) == "2026-08-02"
    assert str(rows[0].amount) == "-10.00"
    assert str(rows[0].balance) == "90.00"
    assert rows[0].external_id is not None
    assert rows[0].merchant == "TEST SHOP"
    assert rows[0].transaction_type == "Card Payment"
    assert rows[1].counterparty == "Test Sender"
    assert rows[1].currency == "PLN"


def test_parses_velo_pdf_rows_with_wrapped_descriptions() -> None:
    rows = _parse_velo_pdf_text(VELO_TEXT, account="Velo test")

    assert len(rows) == 2
    assert str(rows[0].booking_date) == "2026-08-03"
    assert str(rows[0].value_date) == "2026-07-31"
    assert rows[0].merchant == "TEST SHOP"
    assert rows[0].transaction_type == "Card Payment"
    assert rows[0].external_id is not None
    assert str(rows[1].amount) == "45.58"
    assert str(rows[1].balance) == "389.91"
    assert rows[1].merchant == "Zwrot"
    assert rows[1].counterparty == "Test Sender"


def test_rejects_velo_pdf_when_balance_chain_is_incomplete() -> None:
    with pytest.raises(ValueError, match="Kolejne salda"):
        _parse_velo_pdf_text(VELO_TEXT.replace("389,91", "390,00"))


def test_parses_velo_card_refund_merchant() -> None:
    [row] = _parse_velo_pdf_text(VELO_REFUND_TEXT)

    assert row.merchant == "TEST SHOP"
    assert row.transaction_type == "Card Refund"


def test_parses_velo_phone_transfer_title_without_repeating_the_counterparty() -> None:
    [row] = _parse_velo_pdf_text(VELO_PHONE_TRANSFER_TEXT)

    assert row.merchant == "Przelew na telefon"
    assert row.counterparty == "ZUZANNA CZYŻOWSKA"
    assert row.transaction_type == "Incoming Transfer"
    assert "48693***734" in row.description


def test_parses_ing_pdf_rows_and_stable_transaction_ids() -> None:
    rows = _parse_ing_pdf_text(ING_TEXT, account="ING test")

    assert len(rows) == 2
    assert rows[0].external_id == "202622497705026086"
    assert str(rows[0].amount) == "50.00"
    assert rows[0].merchant == "TEST SENDER"
    assert str(rows[1].value_date) == "2026-08-15"
    assert rows[1].description.endswith("TR.KART")
    assert str(rows[1].amount) == "-24.99"
    assert rows[1].transaction_type == "Card Payment"
