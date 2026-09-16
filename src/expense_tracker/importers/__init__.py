from __future__ import annotations

from pathlib import Path
from typing import Literal

from ..csv_utils import read_csv
from .common import _column, _key, _parse_amount, _parse_date
from .erste import _looks_like_erste_csv, import_erste_csv
from .ing_pdf import _parse_ing_pdf_text, import_ing_pdf
from .nest import derive_external_id, import_nest_csv, parse_balance
from .pdf_common import _extract_pdf_text
from .revolut import import_revolut_csv
from .velo_pdf import _parse_velo_pdf_text, import_velo_pdf

BankFormat = Literal["nest", "revolut", "erste", "ing_pdf", "velo_pdf"]


def detect_format(headers: list[str]) -> Literal["nest", "revolut"] | None:
    keys = {_key(header) for header in headers}
    revolut_groups = (
        {"started date", "data rozpoczecia"},
        {"completed date", "data zrealizowania"},
        {"state", "stan"},
    )
    if all(keys & group for group in revolut_groups):
        return "revolut"
    if "kwota" in keys and ("data ksiegowania" in keys or "data operacji" in keys or "data" in keys):
        return "nest"
    return None


def detect_file_format(path: Path) -> BankFormat | None:
    suffix = path.suffix.casefold()
    if suffix == ".csv":
        headers, _ = read_csv(path)
        known = detect_format(headers)
        if known:
            return known
        return "erste" if _looks_like_erste_csv(path) else None
    if suffix == ".pdf":
        normalized = _key(_extract_pdf_text(path))
        if "velobank" in normalized and "saldo po transakcji" in normalized:
            return "velo_pdf"
        if "ing bank slaski" in normalized and "nr transakcji" in normalized:
            return "ing_pdf"
    return None


__all__ = [
    "_column",
    "_parse_amount",
    "_parse_date",
    "_parse_ing_pdf_text",
    "_parse_velo_pdf_text",
    "derive_external_id",
    "detect_file_format",
    "detect_format",
    "import_erste_csv",
    "import_ing_pdf",
    "import_nest_csv",
    "import_revolut_csv",
    "import_velo_pdf",
    "parse_balance",
]
