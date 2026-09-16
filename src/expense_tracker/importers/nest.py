from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from ..csv_utils import read_csv
from ..models import Transaction
from .common import _column, _derived_external_id, _parse_amount, _parse_date

_BALANCE_COLUMNS = ("saldo", "saldo po operacji", "balance")
_DESCRIPTION_COLUMNS = ("opis", "tytuł", "tytuł operacji", "nazwa kontrahenta", "description")


def parse_balance(row: dict[str, str]) -> Decimal | None:
    value = _column(row, *_BALANCE_COLUMNS, required=False)
    if not value:
        return None
    try:
        return _parse_amount(value)
    except ValueError:
        # A stray quote in a merchant name can shift a row's columns and leave the balance
        # unparsable; the balance only disambiguates duplicates, so drop it rather than fail
        # the whole import.
        return None


def derive_external_id(row: dict[str, str]) -> str:
    real_id = _column(row, "id transakcji", "numer referencyjny", "transaction id", required=False)
    if real_id:
        return real_id
    # Nest exports rarely carry a transaction id, so two same-day purchases with the same amount
    # and description would otherwise get the same identity; the running balance tells them apart.
    booking_date = _column(row, "data operacji", required=False) or _column(row, "data księgowania", "data", "date")
    amount = _column(row, "kwota", "amount", "kwota transakcji")
    balance = _column(row, *_BALANCE_COLUMNS, required=False) or ""
    description = _column(row, *_DESCRIPTION_COLUMNS)
    return _derived_external_id("nest", booking_date, amount, balance, description)


def import_nest_csv(path: Path, account: str = "nest") -> list[Transaction]:
    _, rows = read_csv(path)
    transactions: list[Transaction] = []
    for number, row in enumerate(rows, start=2):
        try:
            amount_text = _column(row, "kwota", "amount", "kwota transakcji")
            currency = _column(row, "waluta", "currency", required=False) or "PLN"
            booking_date = _column(row, "data operacji", required=False) or _column(
                row, "data księgowania", "data", "date"
            )
            value_date = _column(row, "data operacji", "data waluty", "value date", required=False)
            description = _column(row, *_DESCRIPTION_COLUMNS)
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
                    booking_date=_parse_date(booking_date),
                    value_date=_parse_date(value_date) if value_date else None,
                    amount=_parse_amount(amount_text),
                    currency=currency.upper(),
                    description=description,
                    counterparty=counterparty or None,
                    external_id=derive_external_id(row),
                    balance=parse_balance(row),
                    raw=row,
                    merchant=description,
                    transaction_type=transaction_type or None,
                )
            )
        except ValueError as exc:
            raise ValueError(f"Błąd w wierszu {number}: {exc}") from exc
    return transactions
