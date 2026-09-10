from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class Transaction:
    account: str
    booking_date: date
    amount: Decimal
    currency: str
    description: str
    counterparty: str | None = None
    external_id: str | None = None
    value_date: date | None = None
    balance: Decimal | None = None
    raw: dict[str, str] | None = None


@dataclass(frozen=True)
class MatchCandidate:
    transaction_id: int
    other_transaction_id: int
    score: float
    reason: str
