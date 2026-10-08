from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from .cash_flows import CASH_DEPOSIT, CASH_WITHDRAWAL

# Only facts are stored: cash movements come from statements, counts and their split from the
# user. Spending and corrections are recomputed on every read, so a statement imported late
# changes what a period means without ever doubling money.
CASH_ACCOUNT = "Gotówka"
HOME_CURRENCY = "PLN"
INACTIVE = ("DECLINED", "REVERTED", "FAILED")


@dataclass
class Count:
    id: int
    counted_on: str
    amount: Decimal
    lines: list[dict]
    start: bool = False
    spent: Decimal = Decimal(0)
    correction: Decimal = Decimal(0)

    @property
    def unassigned(self) -> Decimal:
        return self.spent - sum((line["amount"] for line in self.lines), Decimal(0))


@dataclass
class CashState:
    balance: Decimal
    flows: list[dict] = field(default_factory=list)
    counts: list[Count] = field(default_factory=list)


def _flows(connection: sqlite3.Connection, currency: str) -> list[dict]:
    rows = connection.execute(
        f"""SELECT t.id, t.account, t.booking_date, t.amount, t.description, d.category_key
        FROM transactions t LEFT JOIN transaction_decisions d ON d.transaction_id = t.id
        WHERE t.currency = ? AND t.bank_status NOT IN ({",".join("?" * len(INACTIVE))})
        AND t.id NOT IN (SELECT transaction_id FROM case_members)
        AND (d.category_key IN (?, ?) OR t.account = ?)
        ORDER BY t.booking_date, t.id""",
        (currency, *INACTIVE, CASH_WITHDRAWAL, CASH_DEPOSIT, CASH_ACCOUNT),
    ).fetchall()
    flows = []
    for row in rows:
        amount = Decimal(str(row["amount"]))
        if row["account"] != CASH_ACCOUNT:
            # A bank withdrawal leaves the account as a negative amount and arrives in the hand.
            amount = -amount
        kind = (
            "withdrawal" if row["category_key"] == CASH_WITHDRAWAL and row["account"] != CASH_ACCOUNT
            else "deposit" if row["category_key"] == CASH_DEPOSIT and row["account"] != CASH_ACCOUNT
            else "entry"
        )
        flows.append({
            "transaction_id": row["id"], "date": row["booking_date"], "amount": amount,
            "kind": kind, "description": row["description"], "account": row["account"],
        })
    return flows


def _counts(connection: sqlite3.Connection, currency: str) -> list[Count]:
    counts = [
        Count(id=row["id"], counted_on=row["counted_on"], amount=Decimal(row["amount"]), lines=[])
        for row in connection.execute(
            "SELECT id, counted_on, amount FROM cash_counts WHERE currency = ? ORDER BY counted_on",
            (currency,),
        )
    ]
    by_id = {count.id: count for count in counts}
    for row in connection.execute(
        """SELECT l.count_id, l.category_key, c.label, l.amount, l.description
        FROM cash_count_lines l JOIN categories c ON c.key = l.category_key ORDER BY l.id"""
    ):
        if row["count_id"] in by_id:
            by_id[row["count_id"]].lines.append({
                "category_key": row["category_key"], "label": row["label"],
                "amount": Decimal(row["amount"]), "description": row["description"],
            })
    return counts


def _replay(flows: list[dict], counts: list[Count]) -> Decimal:
    # A count is the truth at the end of its day: everything dated on or before it is
    # already reflected in the counted amount.
    balance = Decimal(0)
    remaining = list(flows)
    for index, count in enumerate(counts):
        before = [flow for flow in remaining if flow["date"] <= count.counted_on]
        remaining = [flow for flow in remaining if flow["date"] > count.counted_on]
        expected = balance + sum((flow["amount"] for flow in before), Decimal(0))
        count.start = index == 0
        if not count.start:
            difference = expected - count.amount
            count.spent = max(difference, Decimal(0))
            count.correction = max(-difference, Decimal(0))
        balance = count.amount
    return balance + sum((flow["amount"] for flow in remaining), Decimal(0))


def cash_state(connection: sqlite3.Connection, currency: str = HOME_CURRENCY) -> CashState:
    flows = _flows(connection, currency)
    counts = _counts(connection, currency)
    return CashState(balance=_replay(flows, counts), flows=flows, counts=counts)


def count_preview(
    connection: sqlite3.Connection, *, currency: str, counted_on: date, amount: Decimal
) -> Count:
    flows = _flows(connection, currency)
    counts = [count for count in _counts(connection, currency) if count.counted_on != str(counted_on)]
    candidate = Count(id=0, counted_on=str(counted_on), amount=amount, lines=[])
    counts = sorted([*counts, candidate], key=lambda count: count.counted_on)
    _replay(flows, counts)
    return candidate


def add_count(
    connection: sqlite3.Connection,
    *,
    currency: str,
    counted_on: date,
    amount: Decimal,
    lines: list[tuple[Decimal, str, str | None]],
) -> int:
    if amount < 0:
        raise ValueError("Kwota nie może być ujemna.")
    if connection.execute(
        "SELECT 1 FROM cash_counts WHERE currency = ? AND counted_on = ?", (currency, str(counted_on))
    ).fetchone():
        raise ValueError("Na ten dzień gotówka jest już policzona.")
    preview = count_preview(connection, currency=currency, counted_on=counted_on, amount=amount)
    if any(line_amount <= 0 for line_amount, _, _ in lines):
        raise ValueError("Każda kwota musi być większa od zera.")
    assigned = sum((line_amount for line_amount, _, _ in lines), Decimal(0))
    if assigned > preview.spent:
        raise ValueError(f"Wydano {preview.spent} {currency}, a przypisujesz {assigned}.")
    with connection:
        cursor = connection.execute(
            "INSERT INTO cash_counts(currency, counted_on, amount) VALUES (?, ?, ?)",
            (currency, str(counted_on), str(amount)),
        )
        count_id = int(cursor.lastrowid)
        connection.executemany(
            "INSERT INTO cash_count_lines(count_id, category_key, amount, description) VALUES (?, ?, ?, ?)",
            [(count_id, category, str(line_amount), description) for line_amount, category, description in lines],
        )
    return count_id


def spending_items(connection: sqlite3.Connection) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for count in cash_state(connection).counts:
        for line in count.lines:
            items.append(_item(count, line["amount"], line["category_key"], line["label"], line["description"]))
        if count.unassigned > 0:
            items.append(_item(count, count.unassigned, "uncategorized_expense", "Niesklasyfikowane wydatki", None))
    return items


def _item(count: Count, amount: Decimal, category: str, label: str, description: str | None) -> dict[str, object]:
    return {
        "transaction_id": None, "date": count.counted_on, "amount": amount, "currency": HOME_CURRENCY,
        "kind": "expense", "category": category, "label": label, "merchant": description or CASH_ACCOUNT,
    }
