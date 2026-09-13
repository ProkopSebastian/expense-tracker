from __future__ import annotations

import re
from pathlib import Path

from ..models import Transaction
from .common import _derived_external_id, _key, _parse_amount, _parse_date
from .pdf_common import _extract_pdf_text, _pdf_lines

_DATE = re.compile(r"^\d{4}\.\d{2}\.\d{2}$")
_MONEY = re.compile(r"^[+-]?(?:\d{1,3}(?:[ .]\d{3})*|\d+),\d{2}$")
_CARD_MERCHANT = re.compile(
    r"^(?:(?:Zwrot\s+operacji)|Operacja)\s+kartą\b.*?\bna kwotę\s+"
    r"[+-]?\d+(?:[.,]\d{2})\s+[A-Z]{3}\s+w\s+(.+)$",
    re.I,
)
_PARTY = re.compile(
    r"(?:Prowadzon\w* na rzecz|Odbiorca|Nadawca):\s*(.+?)(?=\s+(?:Tytułem|Tytuł):|$)",
    re.I,
)
_TITLE = re.compile(r"(?:Tytułem|Tytuł):\s*(.+)$", re.I)
_REPEATED_TITLE = re.compile(
    r"^(?P<title>.+?)\s+(?P<reference>[\d*][\d* ./-]*)\s+(?P=title)$",
    re.I,
)


def _card_merchant(value: str) -> str:
    parts = [part.strip() for part in value.split(",") if part.strip()]
    if parts and re.fullmatch(r"[A-Z]{3}", parts[-1], re.I):
        parts.pop()
    if len(parts) > 1:
        parts.pop()
    return ", ".join(parts).strip() or value.strip()


def _transfer_title(value: str) -> str:
    title = value.strip(" ,.")
    repeated = _REPEATED_TITLE.fullmatch(title)
    return repeated.group("title").strip(" ,.") if repeated else title


def _merchant_party_and_type(description: str) -> tuple[str, str | None, str]:
    card_match = _CARD_MERCHANT.match(description)
    if card_match:
        transaction_type = "Card Refund" if description.casefold().startswith("zwrot") else "Card Payment"
        return _card_merchant(card_match.group(1)), None, transaction_type
    party_match = _PARTY.search(description)
    title_match = _TITLE.search(description)
    counterparty = party_match.group(1).strip(" ,.") if party_match else None
    merchant = _transfer_title(title_match.group(1)) if title_match else (counterparty or description)
    if description.casefold().startswith("przelew wychodzący"):
        transaction_type = "Outgoing Transfer"
    elif description.casefold().startswith("przelew przychodzący"):
        transaction_type = "Incoming Transfer"
    else:
        transaction_type = "Transfer" if party_match else "Other"
    return merchant, counterparty, transaction_type


def _parse_velo_pdf_text(text: str, account: str = "velo") -> list[Transaction]:
    currency_match = re.search(r"Waluta rachunku:\s*([A-Z]{3})", text, re.I)
    currency = currency_match.group(1).upper() if currency_match else "PLN"
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
        while cursor < len(lines) and not _MONEY.fullmatch(lines[cursor]):
            if _DATE.fullmatch(lines[cursor]):
                raise ValueError("Nie udało się rozdzielić operacji w wyciągu Velo PDF.")
            description_parts.append(lines[cursor])
            cursor += 1
        if cursor + 1 >= len(lines) or not _MONEY.fullmatch(lines[cursor + 1]):
            raise ValueError("Operacja w wyciągu Velo PDF nie ma kwoty lub salda.")
        description = " ".join(description_parts).strip()
        if not description:
            raise ValueError("Operacja w wyciągu Velo PDF nie ma opisu.")
        merchant, counterparty, transaction_type = _merchant_party_and_type(description)
        transactions.append(
            Transaction(
                account=account,
                booking_date=_parse_date(booking),
                value_date=_parse_date(value),
                amount=_parse_amount(lines[cursor]),
                currency=currency,
                description=description,
                counterparty=counterparty,
                external_id=_derived_external_id("velo", booking, value, lines[cursor], lines[cursor + 1]),
                balance=_parse_amount(lines[cursor + 1]),
                raw={
                    "Bank": "VeloBank",
                    "Booking date": booking,
                    "Value date": value,
                    "Description": description,
                    "Amount": lines[cursor],
                    "Currency": currency,
                    "Balance": lines[cursor + 1],
                },
                merchant=merchant,
                transaction_type=transaction_type,
            )
        )
        index = cursor + 2
    if not transactions:
        raise ValueError("Wyciąg Velo PDF nie zawiera rozpoznawalnych operacji.")
    for previous, current in zip(transactions, transactions[1:], strict=False):
        if previous.balance is None or previous.balance + current.amount != current.balance:
            raise ValueError("Kolejne salda w wyciągu Velo PDF nie zgadzają się z kwotami operacji.")
    opening_index = next((i for i, line in enumerate(lines) if _key(line) == "saldo poczatkowe"), None)
    if opening_index is not None:
        opening = next((_parse_amount(line) for line in lines[opening_index + 1 :] if _MONEY.fullmatch(line)), None)
        if opening is not None and opening + transactions[0].amount != transactions[0].balance:
            raise ValueError("Pierwsze saldo w wyciągu Velo PDF nie zgadza się z saldem początkowym.")
    return transactions


def import_velo_pdf(path: Path, account: str = "velo") -> list[Transaction]:
    return _parse_velo_pdf_text(_extract_pdf_text(path), account)
