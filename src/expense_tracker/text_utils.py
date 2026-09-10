from __future__ import annotations

import re

_CARD_SUFFIX = re.compile(r"nr\s*karty\s*\.{0,3}\s*\d{2,}", re.IGNORECASE)
_TRAILING_AMOUNT = re.compile(r"\b\d+(?:[.,]\d+)?\s*pln\b", re.IGNORECASE)

_CARD_OPERATION_TYPES = {"płatności kartą", "card payment"}


def clean_description(text: str) -> str:
    """Strip card-masking noise (e.g. "Nr karty ...4724") and a trailing embedded amount
    from a raw bank description, for display only — the stored description is untouched."""
    cleaned = _CARD_SUFFIX.sub("", text)
    cleaned = _TRAILING_AMOUNT.sub("", cleaned)
    cleaned = " ".join(cleaned.split())
    return cleaned or text


def is_card_operation(operation_type: str | None) -> bool:
    return (operation_type or "").strip().casefold() in _CARD_OPERATION_TYPES
