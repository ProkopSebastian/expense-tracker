from __future__ import annotations

import re

ACCOUNT_NUMBER = re.compile(r"\b\d[\d -]{18,}\d\b")
CARD_SUFFIX = re.compile(r"\b(?:nr\s*karty|card)\s*\.{0,3}\s*\d{4}\b", re.IGNORECASE)
EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")
PHONE = re.compile(r"\b(?:\+?48[ -]?)?(?:\d[ -]?){8,11}\b")


def redact_text(value: str) -> str:
    replacements = (
        (ACCOUNT_NUMBER, "[RACHUNEK]"),
        (CARD_SUFFIX, "[KARTA]"),
        (EMAIL, "[EMAIL]"),
        (PHONE, "[TELEFON]"),
    )
    for pattern, replacement in replacements:
        value = pattern.sub(replacement, value)
    return " ".join(value.split())
