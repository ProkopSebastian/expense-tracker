from __future__ import annotations

from decimal import Decimal

# Fixed, never-cycled category -> color order (see the dataviz skill's palette
# reference). The first 8 hues are the CVD-validated categorical set; the rest
# are extra, lower-priority hues used only when a category still has its own
# slice after the "top 7 + Inne" fold below.
_FIXED_CATEGORY_ORDER = (
    "food",
    "transport",
    "shopping",
    "entertainment",
    "travel",
    "housing",
    "health",
    "subscriptions",
    "education",
    "gifts",
    "savings",
    "pets",
    "uncategorized_expense",
)
_PALETTE = (
    "#2a78d6",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#4a3aa7",
    "#e34948",
    "#8d6e63",
    "#26a69a",
    "#7cb342",
    "#ab47bc",
    "#898781",
)
OTHER_COLOR = "#898781"
CATEGORY_COLORS: dict[str, str] = dict(zip(_FIXED_CATEGORY_ORDER, _PALETTE, strict=False))
TOP_N_SLICES = 7


def pln(amount: Decimal | float) -> str:
    return f"{Decimal(amount):,.2f} zł".replace(",", " ").replace(".", ",")


def category_options(categories: list[dict[str, object]]) -> dict[str, str]:
    return {str(category["label"]): str(category["key"]) for category in categories}


def chart_slices(breakdown_level: dict[str, dict], limit: int = TOP_N_SLICES) -> list[dict[str, object]]:
    """Turn a {key: {label, total}} breakdown level into chart-ready slices, sorted by
    value with the long tail folded into one "Inne" slice (see dataviz skill: past ~7-8
    categorical series, fold the tail rather than generate more hues)."""
    entries = sorted(
        ({"key": key, "label": data["label"], "total": data["total"]} for key, data in breakdown_level.items()),
        key=lambda entry: entry["total"],
        reverse=True,
    )
    head, tail = entries[:limit], entries[limit:]
    slices = [
        {**entry, "total": float(entry["total"]), "color": CATEGORY_COLORS.get(entry["key"], OTHER_COLOR)}
        for entry in head
    ]
    if tail:
        other_total = sum((entry["total"] for entry in tail), Decimal())
        if other_total:
            slices.append({"key": "__other", "label": "Inne", "total": float(other_total), "color": OTHER_COLOR})
    return slices
