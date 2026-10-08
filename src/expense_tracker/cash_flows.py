from __future__ import annotations

import re
import sqlite3
from decimal import Decimal

CASH_WITHDRAWAL = "cash_withdrawal"
CASH_DEPOSIT = "cash_deposit"
OFF_BALANCE = frozenset({"transfer_own", CASH_WITHDRAWAL, CASH_DEPOSIT})

# Bank wording for cash leaving or entering an account. Matching is limited to these phrases
# and to the direction of the money, so a "Wypłata z oszczędności" transfer or a cashback
# reward never reads as cash.
_WITHDRAWAL = re.compile(r"bankoma[tc]|wyp[łl]ata got[óo]wk|cash withdrawal|atm withdrawal")
_DEPOSIT = re.compile(r"wp[łl]atoma[tc]|wp[łl]ata got[óo]wk|wp[łl]ata w bankoma[tc]|cash deposit")
_WITHDRAWAL_TYPES = {"cash withdrawal"}
_DEPOSIT_TYPES = {"cash deposit"}
_NEVER_CASH_TYPES = {"fee"}


def cash_flow(description: str, transaction_type: str | None, amount: Decimal) -> str | None:
    kind = (transaction_type or "").casefold()
    if kind in _NEVER_CASH_TYPES:
        return None
    text = description.casefold()
    if amount < 0 and (kind in _WITHDRAWAL_TYPES or _WITHDRAWAL.search(text)):
        return CASH_WITHDRAWAL
    if amount > 0 and (kind in _DEPOSIT_TYPES or _DEPOSIT.search(text)):
        return CASH_DEPOSIT
    return None


def categorize_cash_flows(connection: sqlite3.Connection) -> None:
    rows = connection.execute(
        """SELECT t.id, t.description, t.transaction_type, t.amount FROM transactions t
        WHERE t.id NOT IN (SELECT transaction_id FROM transaction_decisions)
        AND t.id NOT IN (SELECT transaction_id FROM case_members)"""
    ).fetchall()
    for row in rows:
        category = cash_flow(row["description"], row["transaction_type"], Decimal(str(row["amount"])))
        if category is None:
            continue
        connection.execute(
            """INSERT INTO transaction_decisions (transaction_id, category_key, source, status, confidence, explanation)
            VALUES (?, ?, 'rule', 'approved', 1, 'Rozpoznano po opisie banku')""",
            (row["id"], category),
        )
