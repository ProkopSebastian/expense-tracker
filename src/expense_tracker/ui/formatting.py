from __future__ import annotations

import colorsys
import hashlib
from decimal import Decimal

# Fixed, never-cycled category colors. The muted palette keeps categories
# recognizable without making a large sunburst feel visually overpowering.
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
    "#5f8fc4",
    "#cb8065",
    "#58a487",
    "#c79a43",
    "#c9859f",
    "#639469",
    "#766daa",
    "#c47170",
    "#927c74",
    "#5d9f99",
    "#86a15d",
    "#9672a3",
    "#898985",
)
OTHER_COLOR = "#898985"
CATEGORY_COLORS: dict[str, str] = dict(zip(_FIXED_CATEGORY_ORDER, _PALETTE, strict=False))
TOP_N_SLICES = 7


def money(amount: Decimal | float, currency: str) -> str:
    suffix = "zł" if currency == "PLN" else currency
    return f"{Decimal(amount):,.2f} {suffix}".replace(",", " ").replace(".", ",")


def pln(amount: Decimal | float) -> str:
    return money(amount, "PLN")


def category_options(categories: list[dict[str, object]]) -> dict[str, str]:
    return {str(category["label"]): str(category["key"]) for category in categories}


def family_color(family_key: str, key: str) -> str:
    """Return a stable, distinct shade for a slice within a top-level family."""
    base = CATEGORY_COLORS.get(family_key, OTHER_COLOR).lstrip("#")
    red, green, blue = (int(base[index : index + 2], 16) / 255 for index in range(0, 6, 2))
    hue, lightness, saturation = colorsys.rgb_to_hls(red, green, blue)

    # A digest keeps the mapping stable if the sort order changes with monthly totals.
    variant = hashlib.blake2s(key.encode(), digest_size=1).digest()[0] % 7
    hue = (hue + (-0.08, -0.05, -0.025, 0, 0.025, 0.05, 0.08)[variant]) % 1
    lightness = (0.36, 0.43, 0.50, 0.57, 0.64, 0.46, 0.60)[variant]
    saturation = max(0.32, min(0.58, saturation))
    red, green, blue = colorsys.hls_to_rgb(hue, lightness, saturation)
    return f"#{round(red * 255):02x}{round(green * 255):02x}{round(blue * 255):02x}"


def chart_slices(
    breakdown_level: dict[str, dict], limit: int = TOP_N_SLICES, color_family_key: str | None = None
) -> list[dict[str, object]]:
    """Turn a {key: {label, total}} breakdown level into chart-ready slices, sorted by
    value with the long tail folded into one "Inne" slice (see dataviz skill: past ~7-8
    categorical series, fold the tail rather than generate more hues)."""
    entries = sorted(
        ({"key": key, "label": data["label"], "total": data["total"]} for key, data in breakdown_level.items()),
        key=lambda entry: entry["total"],
        reverse=True,
    )
    head, tail = entries[:limit], entries[limit:]
    slices = []
    for entry in head:
        key = str(entry["key"])
        color = family_color(color_family_key, key) if color_family_key else CATEGORY_COLORS.get(key, OTHER_COLOR)
        slices.append({**entry, "total": float(entry["total"]), "color": color})
    if tail:
        other_total = sum((entry["total"] for entry in tail), Decimal())
        if other_total:
            slices.append({"key": "__other", "label": "Inne", "total": float(other_total), "color": OTHER_COLOR})
    return slices
