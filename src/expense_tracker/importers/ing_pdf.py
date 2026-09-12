from __future__ import annotations

import re
from pathlib import Path

from ..models import Transaction
from .common import _parse_amount, _parse_date
from .pdf_common import _extract_pdf_text, _pdf_lines

_DATE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")
_ROW_END = re.compile(
    r"^(?P<prefix>.*?)(?P<external_id>\d{18})\s+"
    r"(?P<amount>[+-]?(?:\d{1,3}(?:[ .]\d{3})*|\d+),\d{2})\s+(?P<currency>[A-Z]{3})$"
)
_PARTY = re.compile(
    r"Nazwa i adres (?:płatnika|odbiorcy):\s*(.+?)(?=\s+(?:Nagroda|Przelew|Płatność|Zwrot|Wypłata|Polecenie)\b|$)",
    re.I,
)
_OPERATION = re.compile(r"\b(Nagroda|Przelew|Płatność|Zwrot|Wypłata|Polecenie)\b.*", re.I)


def _merchant_party_and_type(description: str) -> tuple[str, str | None, str | None]:
    party_match = _PARTY.search(description)
    counterparty = party_match.group(1).strip(" ,.") if party_match else None
    operation_match = _OPERATION.search(description)
    merchant = counterparty or (operation_match.group(0).strip() if operation_match else description)
    normalized = description.casefold()
    if "płatność kartą" in normalized:
        transaction_type = "Card Payment"
    elif "przelew" in normalized:
        transaction_type = "Transfer"
    elif "nagroda" in normalized:
        transaction_type = "Reward"
    else:
        transaction_type = None
    return merchant, counterparty, transaction_type


def _parse_ing_pdf_text(text: str, account: str = "ing") -> list[Transaction]:
    lines = _pdf_lines(text)
    transactions: list[Transaction] = []
    index = 0
    while index < len(lines) - 1:
        if not (_DATE.fullmatch(lines[index]) and _DATE.fullmatch(lines[index + 1])):
            index += 1
            continue
        booking, value = lines[index], lines[index + 1]
        cursor = index + 2
        description_parts: list[str] = []
        row_end: re.Match[str] | None = None
        while cursor < len(lines):
            row_end = _ROW_END.fullmatch(lines[cursor])
            if row_end:
                break
            if _DATE.fullmatch(lines[cursor]):
                raise ValueError("Nie udało się rozdzielić operacji w wyciągu ING PDF.")
            description_parts.append(lines[cursor])
            cursor += 1
        if row_end is None:
            raise ValueError("Operacja w wyciągu ING PDF nie ma kwoty lub numeru transakcji.")
        if row_end.group("prefix").strip():
            description_parts.append(row_end.group("prefix").strip())
        description = " ".join(description_parts).strip()
        if not description:
            raise ValueError("Operacja w wyciągu ING PDF nie ma opisu.")
        merchant, counterparty, transaction_type = _merchant_party_and_type(description)
        transactions.append(
            Transaction(
                account=account,
                booking_date=_parse_date(booking),
                value_date=_parse_date(value),
                amount=_parse_amount(row_end.group("amount")),
                currency=row_end.group("currency"),
                description=description,
                counterparty=counterparty,
                external_id=row_end.group("external_id"),
                raw={
                    "Bank": "ING",
                    "Booking date": booking,
                    "Value date": value,
                    "Description": description,
                    "Transaction ID": row_end.group("external_id"),
                    "Amount": row_end.group("amount"),
                    "Currency": row_end.group("currency"),
                },
                merchant=merchant,
                transaction_type=transaction_type,
            )
        )
        index = cursor + 1
    if not transactions:
        raise ValueError("Wyciąg ING PDF nie zawiera rozpoznawalnych operacji.")
    credit_count = re.search(r"Suma uznań\s*\((\d+)\)", text, re.I)
    debit_count = re.search(r"Suma obciążeń\s*\((\d+)\)", text, re.I)
    if credit_count and sum(row.amount > 0 for row in transactions) != int(credit_count.group(1)):
        raise ValueError("Liczba uznań w wyciągu ING PDF nie zgadza się z podsumowaniem.")
    if debit_count and sum(row.amount < 0 for row in transactions) != int(debit_count.group(1)):
        raise ValueError("Liczba obciążeń w wyciągu ING PDF nie zgadza się z podsumowaniem.")
    return transactions


def import_ing_pdf(path: Path, account: str = "ing") -> list[Transaction]:
    return _parse_ing_pdf_text(_extract_pdf_text(path), account)
