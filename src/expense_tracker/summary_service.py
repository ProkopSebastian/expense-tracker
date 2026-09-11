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


class DailyPoint(BaseModel):
    date: date
    change: Decimal
    balance: Decimal


class MonthlyPoint(BaseModel):
    month: str
    change: Decimal


MONTHLY_BARS_LIMIT = 12


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
    daily: list[DailyPoint] = Field(default_factory=list)
    monthly: list[MonthlyPoint] = Field(default_factory=list)
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
    daily = []
    if start is not None and end is not None:
        if (end - start).days > 36600:
            raise ValueError("Wybierz okres nie dłuższy niż 100 lat.")
        chart_end = min(end, date.today())
        totals: dict[date, Decimal] = {}
        for item in filtered:
            day = date.fromisoformat(str(item["date"]))
            signed = item["amount"] if item["kind"] == "income" else -item["amount"]
            totals[day] = totals.get(day, Decimal(0)) + signed
        balance = Decimal(0)
        for offset in range((chart_end - start).days + 1 if chart_end >= start else 0):
            day = start + timedelta(days=offset)
            change = totals.get(day, Decimal(0))
            balance += change
            daily.append(DailyPoint(date=day, change=change, balance=balance))
    monthly_totals: dict[str, Decimal] = {}
    for item in items:
        key = date.fromisoformat(str(item["date"])).strftime("%Y-%m")
        signed = item["amount"] if item["kind"] == "income" else -item["amount"]
        monthly_totals[key] = monthly_totals.get(key, Decimal(0)) + signed
    month_keys: list[str] = []
    cursor_year, cursor_month = date.today().year, date.today().month
    for _ in range(MONTHLY_BARS_LIMIT):
        month_keys.append(f"{cursor_year:04d}-{cursor_month:02d}")
        cursor_month -= 1
        if cursor_month == 0:
            cursor_month, cursor_year = 12, cursor_year - 1
    monthly = [MonthlyPoint(month=key, change=monthly_totals.get(key, Decimal(0))) for key in reversed(month_keys)]
    return SummaryResponse(
        daily=daily,
        monthly=monthly,
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
