from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import datetime
from decimal import Decimal, InvalidOperation

from ..csv_utils import read_text_with_fallback_encoding


def _key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char)).casefold().strip()


def _derived_external_id(bank: str, *parts: str) -> str:
    digest = hashlib.sha256("\x1f".join(parts).encode()).hexdigest()
    return f"{bank}:{digest}"


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
    for pattern in ("%Y-%m-%d", "%Y.%m.%d", "%d.%m.%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(date_part, pattern).date()
        except ValueError:
            pass
    raise ValueError(f"Nieobsługiwany format daty: {value!r}")


def _parse_amount(value: str) -> Decimal:
    cleaned = value.replace("\u00a0", " ").strip()
    cleaned = re.sub(r"\s*[A-Z]{3}$", "", cleaned, flags=re.I).replace(" ", "")
    if "," in cleaned and "." in cleaned:
        decimal_separator = "," if cleaned.rfind(",") > cleaned.rfind(".") else "."
        thousands_separator = "." if decimal_separator == "," else ","
        cleaned = cleaned.replace(thousands_separator, "").replace(decimal_separator, ".")
    else:
        cleaned = cleaned.replace(",", ".")
    try:
        amount = Decimal(cleaned)
        if not amount.is_finite():
            raise InvalidOperation
        return amount
    except InvalidOperation as exc:
        raise ValueError(f"Nieobsługiwana kwota: {value!r}") from exc


_read_text = read_text_with_fallback_encoding
