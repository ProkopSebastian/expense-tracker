from __future__ import annotations

import csv
import re
from decimal import Decimal
from pathlib import Path

from ..models import Transaction
from .common import _derived_external_id, _parse_amount, _parse_date, _read_text

_CARD_MERCHANT = re.compile(
    r"(?:PŁATNOŚĆ|PRZELEW)\s+KARTĄ\s+[+-]?\d+(?:[.,]\d{2})\s+[A-Z]{3}\s+(.+?)(?:\s+\*|$)",
    re.I,
)


def _merchant_and_type(description: str, counterparty: str | None) -> tuple[str, str | None]:
    card_match = _CARD_MERCHANT.search(description)
    if card_match:
        return card_match.group(1).strip(" ,"), "Card Payment"
    transaction_type = "Transfer" if description.casefold().startswith("przelew") else "Other"
    return (counterparty or description).strip(), transaction_type


def _erste_rows(path: Path) -> list[list[str]]:
    rows = list(csv.reader(_read_text(path).splitlines(), delimiter=","))
    if not rows or any(len(row) != 9 for row in rows):
        raise ValueError("Plik Erste ma nieoczekiwany układ kolumn.")
    return [[value.strip() for value in row] for row in rows]


def _looks_like_erste_csv(path: Path) -> bool:
    try:
        rows = _erste_rows(path)
        metadata = rows[0]
        return (
            len(rows) > 1
            and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", metadata[0]))
            and bool(re.fullmatch(r"\d{2}-\d{2}-\d{4}", metadata[1]))
            and bool(re.fullmatch(r"[A-Z]{3}", metadata[4]))
            and metadata[7].isdigit()
            and int(metadata[7]) == len(rows) - 1
        )
    except (ValueError, IndexError):
        return False


def import_erste_csv(path: Path, account: str = "erste") -> list[Transaction]:
    rows = _erste_rows(path)
    metadata, entries = rows[0], rows[1:]
    if not _looks_like_erste_csv(path):
        raise ValueError("Nie rozpoznano nagłówka eksportu Erste.")
    currency = metadata[4].upper()
    transactions: list[Transaction] = []
    for number, row in enumerate(entries, start=1):
        try:
            description = " ".join(part for part in (row[2], row[3]) if part).strip()
            if not description:
                raise ValueError("brakuje opisu operacji")
            counterparty = row[3] or None
            merchant, transaction_type = _merchant_and_type(row[2], counterparty)
            transactions.append(
                Transaction(
                    account=account,
                    booking_date=_parse_date(row[0]),
                    value_date=_parse_date(row[1]),
                    amount=_parse_amount(row[5]),
                    currency=currency,
                    description=description,
                    counterparty=counterparty,
                    external_id=_derived_external_id("erste", row[0], row[1], row[5], row[6]),
                    balance=_parse_amount(row[6]),
                    raw={
                        "Booking date": row[0],
                        "Value date": row[1],
                        "Description": row[2],
                        "Counterparty": row[3],
                        "Counterparty account": row[4],
                        "Amount": row[5],
                        "Currency": currency,
                        "Balance": row[6],
                        "Sequence number": row[7],
                    },
                    merchant=merchant,
                    transaction_type=transaction_type,
                )
            )
        except ValueError as exc:
            raise ValueError(f"Błąd w operacji Erste {number}: {exc}") from exc
    opening_balance = _parse_amount(metadata[5])
    closing_balance = _parse_amount(metadata[6])
    if opening_balance + sum((row.amount for row in transactions), Decimal()) != closing_balance:
        raise ValueError("Sumy operacji Erste nie zgadzają się z saldem początkowym i końcowym.")
    return transactions
