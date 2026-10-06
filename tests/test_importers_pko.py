import pytest

from expense_tracker.importers.pko import _parse_pko_pdf_text


def test_negative_pko_balances_preserve_all_operations():
    rows = _parse_pko_pdf_text(
        "Saldo początkowe 10,00\n"
        "01.01.2026 TEST-1 PRZELEW -20,00 -10,00\n"
        "01.01.2026 Zakupy testowe\n"
        "02.01.2026 TEST-2 PRZELEW 30,00 20,00\n"
        "02.01.2026 Zwrot testowy\n"
        "03.01.2026 TEST-3 PRZELEW -50,00 -30,00\n"
        "03.01.2026 Opłata testowa\n"
        "Saldo końcowe -30,00\n"
    )
    assert [row.external_id for row in rows] == ["TEST-1", "TEST-2", "TEST-3"]
    assert [row.balance for row in rows] == [-10, 20, -30]


@pytest.mark.parametrize("balance", ["brak", "10.00"])
def test_pko_rejects_unreadable_operation_instead_of_partial_import(balance):
    with pytest.raises(ValueError, match="kwoty lub salda"):
        _parse_pko_pdf_text(
            f"01.01.2026 TEST-1 PRZELEW -20,00 {balance}\n"
            "01.01.2026 Zakupy testowe\n"
            "02.01.2026 TEST-2 PRZELEW 30,00 20,00\n"
            "02.01.2026 Zwrot testowy\n"
            "Saldo końcowe 20,00\n"
        )
