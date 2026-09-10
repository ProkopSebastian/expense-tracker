from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Literal

from .csv_utils import read_csv
from .models import Transaction

DECLINED_STATES = {"DECLINED", "REVERTED", "FAILED"}


def _key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char)).casefold().strip()


def _column(row: dict[str, str], *names: str, required: bool = True) -> str | None:
    by_key = {_key(name): value for name, value in row.items()}
    for name in names:
        if _key(name) in by_key:
            return by_key[_key(name)]
    if required:
        available = ", ".join(row)
        raise ValueError(f"Brakuje oczekiwanej kolumny ({', '.join(names)}). Dostępne: {available}")
    return None


def _parse_date(value: str) -> datetime.date:
    date_part = value.strip().split(" ")[0]
    for pattern in ("%Y-%m-%d", "%d.%m.%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(date_part, pattern).date()
        except ValueError:
            pass
    raise ValueError(f"Nieobsługiwany format daty: {value!r}")


def _parse_amount(value: str) -> Decimal:
    cleaned = value.replace("\u00a0", " ").strip()
    cleaned = re.sub(r"\s*[A-Z]{3}$", "", cleaned, flags=re.I).replace(" ", "")
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    else:
        cleaned = cleaned.replace(",", ".")
    try:
        return Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValueError(f"Nieobsługiwana kwota: {value!r}") from exc


def import_nest_csv(path: Path, account: str = "nest") -> list[Transaction]:
    _, rows = read_csv(path)
    transactions: list[Transaction] = []
    for number, row in enumerate(rows, start=2):
        try:
            amount_text = _column(row, "kwota", "amount", "kwota transakcji")
            currency = _column(row, "waluta", "currency", required=False) or "PLN"
            value_date = _column(row, "data operacji", "data waluty", "value date", required=False)
            balance = _column(row, "saldo", "balance", required=False)
            transactions.append(
                Transaction(
                    account=account,
                    booking_date=_parse_date(_column(row, "data księgowania", "data", "date")),
                    value_date=_parse_date(value_date) if value_date else None,
                    amount=_parse_amount(amount_text),
                    currency=currency.upper(),
                    description=_column(
                        row,
                        "opis",
                        "tytuł",
                        "tytuł operacji",
                        "nazwa kontrahenta",
                        "description",
                    ),
                    counterparty=_column(
                        row,
                        "kontrahent",
                        "dane kontrahenta",
                        "nazwa kontrahenta",
                        "counterparty",
                        required=False,
                    )
                    or None,
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
                )
            )
        except ValueError as exc:
            raise ValueError(f"Błąd w wierszu {number}: {exc}") from exc
    return transactions


def import_revolut_csv(path: Path, account: str = "revolut") -> list[Transaction]:
    _, rows = read_csv(path)
    transactions: list[Transaction] = []
    for number, row in enumerate(rows, start=2):
        try:
            state = _column(row, "state", required=False)
            if state and state.strip().upper() in DECLINED_STATES:
                continue
            completed = _column(row, "completed date", required=False)
            balance = _column(row, "balance", required=False)
            transactions.append(
                Transaction(
                    account=account,
                    booking_date=_parse_date(_column(row, "started date")),
                    value_date=_parse_date(completed) if completed else None,
                    amount=_parse_amount(_column(row, "amount")),
                    currency=_column(row, "currency", required=False) or "PLN",
                    description=_column(row, "description"),
                    counterparty=None,
                    external_id=None,
                    balance=_parse_amount(balance) if balance else None,
                    raw=row,
                )
            )
        except ValueError as exc:
            raise ValueError(f"Błąd w wierszu {number}: {exc}") from exc
    return transactions


def detect_format(headers: list[str]) -> Literal["nest", "revolut"] | None:
    keys = {_key(header) for header in headers}
    if {"started date", "completed date", "state"}.issubset(keys):
        return "revolut"
    if "kwota" in keys and ("data ksiegowania" in keys or "data" in keys):
        return "nest"
    return None
