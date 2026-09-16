from __future__ import annotations

import re
from pathlib import Path

from ..models import Transaction
from .common import _parse_amount, _parse_date
from .pdf_common import _extract_pdf_text, _pdf_lines

_MONEY = r"(?:\d{1,3}(?:[ .]\d{3})*|\d+),\d{2}"
_TRANSACTION = re.compile(
    rf"^(?P<booking_date>\d{{2}}\.\d{{2}}\.\d{{4}})\s+(?P<external_id>\S+)\s+(?P<type>.+?)\s+"
    rf"(?P<amount>[+-]?{_MONEY})\s+(?P<balance>{_MONEY})$"
)
_VALUE_DATE = re.compile(r"^(?P<value_date>\d{2}\.\d{2}\.\d{4})\s+(?P<rest>.+)$")
_STOP_LINE = re.compile(r"^Saldo (do przeniesienia|końcowe)\b")
_CLOSING_BALANCE = re.compile(rf"Saldo końcowe\s+({_MONEY})")
_CARD_MERCHANT = re.compile(r"Lokalizacja:\s*(.+?)\s+(?:[A-Z]{2}\s+)?Nr ref:", re.I)
# A Polish account number (26 digits, sometimes grouped in 4s) or "Data dokumentu:" marks where the
# free-text transfer title ends and the sender/recipient details begin.
_TRANSFER_TITLE = re.compile(r"^(.*?)(?:\s+OD:\s|\s+\d{2}(?:\s?\d{4}){6}\b|\s+Data dokumentu:|$)")
_CARD_TRANSACTION_TYPES = {"ZAKUP PRZY UŻYCIU KARTY": "Card Payment", "POS ZWROT TOWARU": "Card Refund"}


def _merchant(description: str) -> str:
    card_match = _CARD_MERCHANT.search(description)
    if card_match:
        return card_match.group(1).strip()
    title = _TRANSFER_TITLE.match(description).group(1).strip()
    return title or description


def _parse_pko_pdf_text(text: str, account: str = "pko") -> list[Transaction]:
    lines = _pdf_lines(text)
    transactions: list[Transaction] = []
    index = 0
    while index < len(lines):
        header = _TRANSACTION.match(lines[index])
        if not header:
            index += 1
            continue
        if index + 1 >= len(lines) or not (value_line := _VALUE_DATE.match(lines[index + 1])):
            raise ValueError("Operacja w wyciągu PKO PDF nie ma daty waluty.")
        description_parts = [value_line.group("rest")]
        cursor = index + 2
        while cursor < len(lines) and not _TRANSACTION.match(lines[cursor]) and not _STOP_LINE.match(lines[cursor]):
            description_parts.append(lines[cursor])
            cursor += 1
        description = " ".join(description_parts).strip()
        raw_type = header.group("type").strip()
        transactions.append(
            Transaction(
                account=account,
                booking_date=_parse_date(header.group("booking_date")),
                value_date=_parse_date(value_line.group("value_date")),
                amount=_parse_amount(header.group("amount")),
                currency="PLN",
                description=description,
                counterparty=None,
                external_id=header.group("external_id"),
                balance=_parse_amount(header.group("balance")),
                raw={
                    "Bank": "PKO",
                    "Data operacji": header.group("booking_date"),
                    "Data waluty": value_line.group("value_date"),
                    "Identyfikator operacji": header.group("external_id"),
                    "Typ operacji": raw_type,
                    "Opis operacji": description,
                    "Kwota operacji": header.group("amount"),
                    "Saldo": header.group("balance"),
                },
                merchant=_merchant(description),
                transaction_type=_CARD_TRANSACTION_TYPES.get(raw_type, raw_type),
            )
        )
        index = cursor
    if not transactions:
        raise ValueError("Wyciąg PKO PDF nie zawiera rozpoznawalnych operacji.")
    for previous, current in zip(transactions, transactions[1:], strict=False):
        if previous.balance is None or previous.balance + current.amount != current.balance:
            raise ValueError("Kolejne salda w wyciągu PKO PDF nie zgadzają się z kwotami operacji.")
    closing = _CLOSING_BALANCE.search(text)
    if closing and transactions[-1].balance != _parse_amount(closing.group(1)):
        raise ValueError("Saldo końcowe w wyciągu PKO PDF nie zgadza się z ostatnią operacją.")
    return transactions


def import_pko_pdf(path: Path, account: str = "pko") -> list[Transaction]:
    return _parse_pko_pdf_text(_extract_pdf_text(path), account)
