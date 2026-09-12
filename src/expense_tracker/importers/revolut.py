from __future__ import annotations

from pathlib import Path

from ..csv_utils import read_csv
from ..models import Transaction
from .common import _column, _key, _parse_amount, _parse_date

INACTIVE_STATES = {"DECLINED", "REVERTED", "FAILED"}
STATE_ALIASES = {
    "zakonczono": "COMPLETED",
    "cofnieto": "REVERTED",
    "odrzucono": "DECLINED",
    "nieudana": "FAILED",
    "nieudane": "FAILED",
    "oczekuje": "PENDING",
    "oczekujaca": "PENDING",
    "przetwarzanie": "PROCESSING",
}
PRODUCT_ALIASES = {"biezace": "Current"}
TYPE_ALIASES = {
    "bankomat": "Cash Withdrawal",
    "płatnosc karta": "Card Payment",
    "przelew": "Transfer",
    "wymiana": "Exchange",
    "zasilenie": "Deposit",
}


def _canonical_state(value: str | None) -> str:
    if not value:
        return "COMPLETED"
    return STATE_ALIASES.get(_key(value), value.strip().upper())


def _canonical_label(value: str | None, aliases: dict[str, str]) -> str:
    if not value:
        return ""
    return aliases.get(_key(value), value.strip())


def import_revolut_csv(path: Path, account: str = "revolut", *, include_inactive: bool = False) -> list[Transaction]:
    _, rows = read_csv(path)
    transactions: list[Transaction] = []
    for number, row in enumerate(rows, start=2):
        try:
            started = _column(row, "started date", "data rozpoczęcia")
            completed = _column(row, "completed date", "data zrealizowania", required=False)
            amount = _column(row, "amount", "kwota")
            currency = (_column(row, "currency", "waluta", required=False) or "PLN").upper()
            description = _column(row, "description", "opis")
            balance = _column(row, "balance", "saldo", required=False)
            state = _canonical_state(_column(row, "state", "stan", required=False))
            if not include_inactive and state in INACTIVE_STATES:
                continue
            raw = dict(row)
            raw.update(
                {
                    "Started Date": started,
                    "Completed Date": completed or "",
                    "Product": _canonical_label(
                        _column(row, "product", "produkt", required=False), PRODUCT_ALIASES
                    ),
                    "Type": _canonical_label(_column(row, "type", "rodzaj", required=False), TYPE_ALIASES),
                    "State": state,
                }
            )
            transaction_type = raw["Type"] or None
            transactions.append(
                Transaction(
                    account=account,
                    booking_date=_parse_date(started),
                    value_date=_parse_date(completed) if completed else None,
                    amount=_parse_amount(amount),
                    currency=currency,
                    description=description,
                    counterparty=None,
                    external_id=_column(row, "transaction id", "id transakcji", "id", required=False) or None,
                    balance=_parse_amount(balance) if balance else None,
                    raw=raw,
                    merchant=description,
                    transaction_type=transaction_type,
                )
            )
        except ValueError as exc:
            raise ValueError(f"Błąd w wierszu {number}: {exc}") from exc
    return transactions
