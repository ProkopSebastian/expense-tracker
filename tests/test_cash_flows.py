from decimal import Decimal

import pytest

from expense_tracker.cash_flows import CASH_DEPOSIT, CASH_WITHDRAWAL, cash_flow


@pytest.mark.parametrize(
    ("description", "transaction_type", "amount", "expected"),
    [
        ("Wypłata BLIK z bankomatu|Bankomat Euronet UL BELGRADZKA 44", "Płatności Blik", "-50", CASH_WITHDRAWAL),
        ("Wypłata gotówki — Nakagyo-ku  Kyoto-shi", "Cash Withdrawal", "-234.77", CASH_WITHDRAWAL),
        ("WYPŁATA W BANKOMACIE PKO BP", "Card Payment", "-200", CASH_WITHDRAWAL),
        ("Wpłata BLIK we wpłatomacie", "Płatności Blik", "300", CASH_DEPOSIT),
        ("Opłata · Wypłata gotówki — Nakagyo-ku  Kyoto-shi", "Fee", "-2.35", None),
        ("Wypłata z oszczędności", "Przelewy przychodzące", "537.77", None),
        ("Z wypłaty", "Przelewy wychodzące", "-5000", None),
        ("Nazwa i adres płatnika: CASHBACK- KONTA-KI(ODSETKI) Nagroda", "Reward", "50.00", None),
    ],
)
def test_cash_flow_recognises_only_cash_movements(description, transaction_type, amount, expected):
    assert cash_flow(description, transaction_type, Decimal(amount)) == expected
