from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from .ledger import merchant_key


def actuals(transactions: list[dict[str, object]], cases: list[dict[str, object]]) -> list[dict[str, object]]:
    case_ids = {row["case_id"] for row in transactions if row["case_id"] and row["case_status"] == "approved"}
    items: list[dict[str, object]] = []
    for row in transactions:
        if row["case_id"] in case_ids:
            continue
        amount = Decimal(str(row["amount"]))
        category = str(row["category_key"] or ("uncategorized_expense" if amount < 0 else "income"))
        label = str(row["category_label"] or ("Niesklasyfikowane wydatki" if amount < 0 else "Przychody"))
        if category == "transfer_own":
            continue
        if amount < 0:
            items.append(
                {
                    "date": row["booking_date"],
                    "amount": -amount,
                    "kind": "expense",
                    "category": category,
                    "label": label,
                    "merchant": str(row["description"]),
                }
            )
        elif amount > 0:
            items.append(
                {
                    "date": row["booking_date"],
                    "amount": amount,
                    "kind": "income",
                    "category": category,
                    "label": label,
                    "merchant": str(row["description"]),
                }
            )
    for case in cases:
        amount = Decimal(str(case["personal_amount"]))
        if amount == 0:
            continue
        items.append(
            {
                "date": case["booking_date"],
                "amount": abs(amount),
                "kind": "expense" if amount > 0 else "income",
                "category": case["category_key"] or "uncategorized_expense",
                "label": case["category_label"] or "Niesklasyfikowane wydatki",
                "merchant": str(case["title"]),
            }
        )
    return items


def summary(items: list[dict[str, object]]) -> dict[str, Decimal]:
    expenses = sum((item["amount"] for item in items if item["kind"] == "expense"), Decimal())
    income = sum((item["amount"] for item in items if item["kind"] == "income"), Decimal())
    return {"expenses": expenses, "income": income, "balance": income - expenses}


def by_category(items: list[dict[str, object]]) -> list[dict[str, object]]:
    totals: defaultdict[str, Decimal] = defaultdict(Decimal)
    for item in items:
        if item["kind"] == "expense":
            totals[str(item["label"])] += item["amount"]
    return [{"Kategoria": label, "Wydatki": float(amount)} for label, amount in sorted(totals.items())]


def _merchant_display(description: str) -> str:
    normalized = merchant_key(description)
    return normalized.title() if normalized else description


def category_breakdown(items: list[dict[str, object]], categories: list[dict[str, object]]) -> dict[str, dict]:
    """Three-level expense breakdown: top-level category -> subcategory -> merchant.

    A decision made directly on a top-level category (no subcategory chosen) is bucketed
    under a synthetic "Inne: <category>" subcategory so subcategory totals always sum to
    the parent's total."""
    by_key = {str(category["key"]): category for category in categories}

    def top_level(category_key: str) -> dict[str, object]:
        category = by_key.get(category_key)
        while category and category["parent_key"]:
            category = by_key.get(str(category["parent_key"]))
        return category or by_key.get("uncategorized_expense", {"key": category_key, "label": category_key})

    breakdown: dict[str, dict] = {}
    for item in items:
        if item["kind"] != "expense":
            continue
        category_key = str(item["category"])
        top = top_level(category_key)
        top_key = str(top["key"])
        top_bucket = breakdown.setdefault(top_key, {"label": top["label"], "total": Decimal(), "children": {}})
        top_bucket["total"] += item["amount"]

        if category_key == top_key:
            sub_key, sub_label = f"{top_key}__other", f"Inne: {top['label']}"
        else:
            sub_key, sub_label = category_key, str(item["label"])
        sub_bucket = top_bucket["children"].setdefault(
            sub_key, {"label": sub_label, "total": Decimal(), "children": {}}
        )
        sub_bucket["total"] += item["amount"]

        merchant_label = _merchant_display(str(item["merchant"]))
        merchant_bucket = sub_bucket["children"].setdefault(
            merchant_label, {"label": merchant_label, "total": Decimal()}
        )
        merchant_bucket["total"] += item["amount"]
    return breakdown
