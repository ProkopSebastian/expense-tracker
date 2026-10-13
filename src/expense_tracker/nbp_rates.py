from __future__ import annotations

import json
import ssl
from datetime import date, timedelta
from decimal import Decimal
from urllib.error import URLError
from urllib.request import Request, urlopen

API = "https://api.nbp.pl/api/exchangerates/rates"
# Table A is published every business day; table B (e.g. TWD) only weekly, so it needs a longer look-back.
TABLES = (("a", 10), ("b", 21))


def _rates(table: str, code: str, start: date, end: date) -> list[dict]:
    import certifi

    context = ssl.create_default_context(cafile=certifi.where())
    url = f"{API}/{table}/{code.lower()}/{start}/{end}/?format=json"
    request = Request(url, headers={"Accept": "application/json"})
    with urlopen(request, timeout=5, context=context) as response:
        return json.load(response, parse_float=Decimal)["rates"]


def official_rates(day: date, currencies: list[str]) -> dict[str, dict[str, str]]:
    end = min(day, date.today())
    found: dict[str, dict[str, str]] = {}
    for code in currencies:
        for table, days_back in TABLES:
            try:
                rates = _rates(table, code, end - timedelta(days=days_back), end)
            except (URLError, TimeoutError, ValueError, KeyError):
                continue
            if rates:
                found[code] = {"rate": str(rates[-1]["mid"]), "day": rates[-1]["effectiveDate"]}
                break
    return found
