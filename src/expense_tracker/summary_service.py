"""UI-independent summary use case. Money stays decimal through the API boundary."""

from __future__ import annotations

import calendar
import sqlite3
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from .dashboard_data import summary_data
from .reporting import category_breakdown, summary

PeriodMode = Literal["month", "30days", "3months", "year", "custom"]


class BreakdownNode(BaseModel):
    key: str
    label: str
    total: Decimal
    children: list[BreakdownNode] = Field(default_factory=list)


class SummaryResponse(BaseModel):
    currency: str
    currencies: list[str]
    months: list[str]
    start: date | None
    end: date | None
    first_date: date | None
    last_date: date | None
    expenses: Decimal = Decimal(0)
    income: Decimal = Decimal(0)
    balance: Decimal = Decimal(0)
    item_count: int = 0
    breakdown: list[BreakdownNode] = Field(default_factory=list)


def _nodes(level: dict) -> list[BreakdownNode]:
    return [
        BreakdownNode(key=key, label=node["label"], total=node["total"], children=_nodes(node.get("children", {})))
        for key, node in sorted(level.items(), key=lambda pair: pair[1]["total"], reverse=True)
    ]


def get_summary(
    connection: sqlite3.Connection,
    *,
    mode: PeriodMode = "month",
    currency: str | None = None,
    month: str | None = None,
    start: date | None = None,
    end: date | None = None,
) -> SummaryResponse:
    data = summary_data(connection)
    currencies = sorted({str(item["currency"]) for item in data["items"]}, key=lambda code: (code != "PLN", code))
    selected = currency or (currencies[0] if currencies else "PLN")
    if currencies and selected not in currencies:
        raise ValueError("Brak danych dla wybranej waluty.")
    items = [item for item in data["items"] if item["currency"] == selected]
    dates = sorted(date.fromisoformat(str(item["date"])) for item in items)
    months = sorted({value.strftime("%Y-%m") for value in dates}, reverse=True)
    first, last = (dates[0], dates[-1]) if dates else (None, None)
    if mode == "custom":
        if start is None or end is None or start > end:
            raise ValueError("Podaj poprawną datę początkową i końcową.")
    elif last is not None:
        end = last
        if mode == "month":
            chosen = month or months[0]
            start = date.fromisoformat(f"{chosen}-01")
            end = date(start.year, start.month, calendar.monthrange(start.year, start.month)[1])
        elif mode == "30days":
            start = max(first, last - timedelta(days=29))
        elif mode == "3months":
            index = last.year * 12 + last.month - 3
            start = max(first, date(index // 12, index % 12 + 1, 1))
        else:
            start = max(first, date(last.year, 1, 1))
    filtered = [item for item in items if start <= date.fromisoformat(str(item["date"])) <= end] if dates else []
    return SummaryResponse(
        currency=selected,
        currencies=currencies,
        months=months,
        start=start,
        end=end,
        first_date=first,
        last_date=last,
        item_count=len(filtered),
        **summary(filtered),
        breakdown=_nodes(category_breakdown(filtered, data["categories"])),
    )
