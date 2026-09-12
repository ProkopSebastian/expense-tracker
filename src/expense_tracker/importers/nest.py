from __future__ import annotations

from pathlib import Path

from ..csv_utils import read_csv
from ..models import Transaction
from .common import _column, _parse_amount, _parse_date


def import_nest_csv(path: Path, account: str = "nest") -> list[Transaction]:
    _, rows = read_csv(path)
    transactions: list[Transaction] = []
    for number, row in enumerate(rows, start=2):
        try:
            amount_text = _column(row, "kwota", "amount", "kwota transakcji")
            currency = _column(row, "waluta", "currency", required=False) or "PLN"
            value_date = _column(row, "data operacji", "data waluty", "value date", required=False)
            balance = _column(row, "saldo", "balance", required=False)
            description = _column(
                row,
                "opis",
                "tytuł",
                "tytuł operacji",
                "nazwa kontrahenta",
                "description",
            )
            counterparty = _column(
                row,
                "kontrahent",
                "dane kontrahenta",
                "nazwa kontrahenta",
                "counterparty",
                required=False,
            )
            transaction_type = _column(row, "rodzaj operacji", "type", required=False)
            transactions.append(
                Transaction(
                    account=account,
                    booking_date=_parse_date(
                        _column(row, "data operacji", required=False)
                        or _column(row, "data księgowania", "data", "date")
                    ),
                    value_date=_parse_date(value_date) if value_date else None,
                    amount=_parse_amount(amount_text),
                    currency=currency.upper(),
                    description=description,
                    counterparty=counterparty or None,
                    external_id=_column(
                        row,
                        "id transakcji",
                        "numer referencyjny",
                        "transaction id",
                        required=False,
                    )
                    or None,
                    balance=_parse_amount(balance) if balance else None,
                    raw=row,
                    merchant=description,
                    transaction_type=transaction_type or None,
                )
            )
        except ValueError as exc:
            raise ValueError(f"Błąd w wierszu {number}: {exc}") from exc
    return transactions
