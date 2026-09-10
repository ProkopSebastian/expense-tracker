from __future__ import annotations

import sqlite3
from datetime import date
from decimal import Decimal

from .models import MatchCandidate


def own_transfer_candidates(connection: sqlite3.Connection, days: int = 3) -> list[MatchCandidate]:
    rows = connection.execute(
        "SELECT id, account, booking_date, amount, currency FROM transactions ORDER BY booking_date"
    ).fetchall()
    candidates: list[MatchCandidate] = []
    for index, left in enumerate(rows):
        for right in rows[index + 1 :]:
            if left["account"] == right["account"] or left["currency"] != right["currency"]:
                continue
            delta = abs((date.fromisoformat(right["booking_date"]) - date.fromisoformat(left["booking_date"])).days)
            if delta > days:
                break
            if Decimal(left["amount"]) + Decimal(right["amount"]) != 0:
                continue
            score = 0.85 if delta == 0 else 0.75
            reason = (
                f"Przeciwne kwoty {left['amount']} {left['currency']} na kontach "
                f"{left['account']} i {right['account']} ({delta} dni różnicy)"
            )
            candidates.append(MatchCandidate(left["id"], right["id"], score, reason))
    return candidates
