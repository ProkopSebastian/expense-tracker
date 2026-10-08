from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from . import ledger
from .cash_flows import CASH_DEPOSIT, CASH_WITHDRAWAL
from .ledger_view import display_title

# Only facts are stored: cash movements come from statements, counts, kantor exchanges and the
# foreign amount of a withdrawal come from the user. Spending, corrections and rates are
# recomputed on every read, so a statement imported late changes what a period means without
# ever doubling money.
CASH_ACCOUNT = "Gotówka"
HOME_CURRENCY = "PLN"
INACTIVE = ("DECLINED", "REVERTED", "FAILED")
MONEY = Decimal("0.01")


@dataclass
class Count:
    id: int
    currency: str
    counted_on: str
    amount: Decimal
    start_cost: Decimal | None
    lines: list[dict]
    first: bool = False
    spent: Decimal = Decimal(0)
    spent_pln: Decimal | None = None
    correction: Decimal = Decimal(0)

    @property
    def unassigned(self) -> Decimal:
        return self.spent - sum((line["amount"] for line in self.lines), Decimal(0))


@dataclass
class Pot:
    balance: Decimal = Decimal(0)
    average_cost: Decimal | None = None
    counted_on: str | None = None

    def add(self, amount: Decimal, cost: Decimal | None) -> None:
        if self.balance <= 0:
            self.average_cost = cost / amount if cost is not None else None
        elif cost is None or self.average_cost is None:
            self.average_cost = None
        else:
            self.average_cost = (self.balance * self.average_cost + cost) / (self.balance + amount)
        self.balance += amount

    def value(self, amount: Decimal) -> Decimal | None:
        return (amount * self.average_cost).quantize(MONEY) if self.average_cost is not None else None


@dataclass
class CashState:
    pots: dict[str, Pot] = field(default_factory=dict)
    flows: list[dict] = field(default_factory=list)
    counts: list[Count] = field(default_factory=list)
    exchanges: list[dict] = field(default_factory=list)
    values: dict[int, Decimal] = field(default_factory=dict)


def _flows(connection: sqlite3.Connection) -> list[dict]:
    rows = connection.execute(
        f"""SELECT t.id, t.account, t.booking_date, t.amount, t.currency, t.description, t.merchant,
                   t.counterparty, d.category_key,
                   f.currency AS cash_currency, f.amount AS cash_amount
        FROM transactions t
        LEFT JOIN transaction_decisions d ON d.transaction_id = t.id
        LEFT JOIN cash_foreign_withdrawals f ON f.transaction_id = t.id
        WHERE t.bank_status NOT IN ({",".join("?" * len(INACTIVE))})
        AND t.id NOT IN (SELECT transaction_id FROM case_members)
        AND (d.category_key IN (?, ?) OR t.account = ?)
        AND COALESCE(t.transaction_type, '') != ?
        ORDER BY t.booking_date, t.id""",
        (*INACTIVE, CASH_WITHDRAWAL, CASH_DEPOSIT, CASH_ACCOUNT, ledger.CASH_COUNT_LINE),
    ).fetchall()
    flows = []
    for row in rows:
        amount = Decimal(str(row["amount"]))
        bank = row["account"] != CASH_ACCOUNT
        kind = "entry"
        currency = row["currency"]
        cost = amount if currency == HOME_CURRENCY else None
        if bank:
            kind = "withdrawal" if row["category_key"] == CASH_WITHDRAWAL else "deposit"
            # Money leaving the account arrives in the hand, and the other way round.
            amount, cost = -amount, -amount if currency == HOME_CURRENCY else None
            if row["cash_currency"]:
                currency, amount = row["cash_currency"], Decimal(row["cash_amount"])
        flows.append({
            "transaction_id": row["id"], "date": row["booking_date"], "currency": currency,
            "amount": amount, "cost": cost, "kind": kind, "description": display_title(dict(row)),
            "account": row["account"], "category_key": row["category_key"],
            "bank_amount": str(-Decimal(str(row["amount"]))) if bank else None,
            "bank_currency": row["currency"] if bank else None,
        })
    return flows


def _counts(connection: sqlite3.Connection) -> list[Count]:
    counts = [
        Count(
            id=row["id"], currency=row["currency"], counted_on=row["counted_on"], amount=Decimal(row["amount"]),
            start_cost=Decimal(row["start_cost"]) if row["start_cost"] is not None else None, lines=[],
        )
        for row in connection.execute(
            "SELECT id, currency, counted_on, amount, start_cost FROM cash_counts ORDER BY counted_on, id"
        )
    ]
    by_id = {count.id: count for count in counts}
    for row in connection.execute(
        """SELECT e.count_id, t.id, t.amount, t.description, d.category_key, c.label
        FROM cash_count_entries e JOIN transactions t ON t.id = e.transaction_id
        LEFT JOIN transaction_decisions d ON d.transaction_id = t.id
        LEFT JOIN categories c ON c.key = d.category_key ORDER BY t.id"""
    ):
        if row["count_id"] in by_id:
            by_id[row["count_id"]].lines.append({
                "transaction_id": row["id"], "category_key": row["category_key"],
                "label": row["label"] or "Do przypisania", "amount": -Decimal(row["amount"]),
                "description": row["description"],
            })
    return counts


def _exchanges(connection: sqlite3.Connection) -> list[dict]:
    return [
        {
            "id": row["id"], "date": row["exchanged_on"],
            "given_currency": row["given_currency"], "given_amount": Decimal(row["given_amount"]),
            "received_currency": row["received_currency"], "received_amount": Decimal(row["received_amount"]),
        }
        for row in connection.execute("SELECT * FROM cash_exchanges ORDER BY exchanged_on, id")
    ]


def _pot(pots: dict[str, Pot], currency: str) -> Pot:
    if currency not in pots:
        pots[currency] = Pot(average_cost=Decimal(1) if currency == HOME_CURRENCY else None)
    return pots[currency]


def _replay(state: CashState) -> None:
    # A count is the truth at the end of its day, so it comes after that day's movements.
    events = [(flow["date"], 0, flow["transaction_id"], "flow", flow) for flow in state.flows]
    events += [(exchange["date"], 0, -exchange["id"], "exchange", exchange) for exchange in state.exchanges]
    events += [(count.counted_on, 1, count.id, "count", count) for count in state.counts]
    for _, _, _, kind, payload in sorted(events, key=lambda event: event[:3]):
        if kind == "flow":
            pot = _pot(state.pots, payload["currency"])
            if payload["amount"] >= 0:
                pot.add(payload["amount"], payload["cost"])
            else:
                value = pot.value(-payload["amount"])
                if value is not None and payload["kind"] == "entry":
                    state.values[payload["transaction_id"]] = -value
                pot.balance += payload["amount"]
        elif kind == "exchange":
            given = _pot(state.pots, payload["given_currency"])
            cost = given.value(payload["given_amount"])
            given.balance -= payload["given_amount"]
            received = payload["received_amount"]
            if payload["received_currency"] == HOME_CURRENCY:
                # Złoty is held at face value; what it differs from the sold currency's cost is a
                # realised exchange-rate result, not a change in the złoty's worth.
                payload["fx_result"] = received - cost if cost is not None else None
                cost = received
            _pot(state.pots, payload["received_currency"]).add(received, cost)
        else:
            pot = _pot(state.pots, payload.currency)
            payload.first = pot.counted_on is None
            difference = pot.balance - payload.amount
            payload.spent = max(difference, Decimal(0))
            payload.spent_pln = pot.value(payload.spent)
            for line in payload.lines:
                value = pot.value(line["amount"])
                if value is not None:
                    state.values[line["transaction_id"]] = -value
            payload.correction = max(-difference, Decimal(0))
            if payload.correction:
                cost = payload.correction if payload.currency == HOME_CURRENCY else payload.start_cost
                pot.add(payload.correction, cost)
            pot.balance = payload.amount
            pot.counted_on = payload.counted_on


def cash_state(connection: sqlite3.Connection) -> CashState:
    state = CashState(flows=_flows(connection), counts=_counts(connection), exchanges=_exchanges(connection))
    _pot(state.pots, HOME_CURRENCY)
    _replay(state)
    return state


def count_preview(
    connection: sqlite3.Connection, *, currency: str, counted_on: date, amount: Decimal, replacing: int | None = None,
) -> Count:
    state = cash_state(connection)
    candidate = Count(id=0, currency=currency, counted_on=str(counted_on), amount=amount, start_cost=None, lines=[])
    others = [
        count for count in _counts(connection)
        if count.id != replacing and (count.currency, count.counted_on) != (currency, str(counted_on))
    ]
    state = CashState(flows=state.flows, exchanges=state.exchanges, counts=[*others, candidate])
    _replay(state)
    return candidate


def _line_ids(connection: sqlite3.Connection, count_id: int) -> list[int]:
    return [
        row["transaction_id"]
        for row in connection.execute("SELECT transaction_id FROM cash_count_entries WHERE count_id = ?", (count_id,))
    ]


def _require_ungrouped(connection: sqlite3.Connection, transaction_ids: list[int]) -> None:
    title = ledger.group_title(connection, transaction_ids)
    if title is not None:
        raise ValueError(f"Część tego liczenia jest w grupie „{title}”. Najpierw rozwiąż grupę.")


def _remove_lines(connection: sqlite3.Connection, transaction_ids: list[int]) -> None:
    for transaction_id in transaction_ids:
        connection.execute("DELETE FROM cash_count_entries WHERE transaction_id = ?", (transaction_id,))
        connection.execute("DELETE FROM transaction_decisions WHERE transaction_id = ?", (transaction_id,))
        connection.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))


def save_count(
    connection: sqlite3.Connection,
    *,
    count_id: int | None = None,
    currency: str,
    counted_on: date,
    amount: Decimal,
    start_cost: Decimal | None,
    lines: list[tuple[Decimal, str, str | None]],
) -> int:
    if amount < 0:
        raise ValueError("Kwota nie może być ujemna.")
    if connection.execute(
        "SELECT 1 FROM cash_counts WHERE currency = ? AND counted_on = ? AND id IS NOT ?",
        (currency, str(counted_on), count_id),
    ).fetchone():
        raise ValueError("Na ten dzień ta waluta jest już policzona.")
    previous_lines = []
    if count_id is not None:
        if connection.execute("SELECT 1 FROM cash_counts WHERE id = ?", (count_id,)).fetchone() is None:
            raise ValueError("Liczenie nie istnieje.")
        previous_lines = _line_ids(connection, count_id)
        _require_ungrouped(connection, previous_lines)
    preview = count_preview(connection, currency=currency, counted_on=counted_on, amount=amount, replacing=count_id)
    if any(line_amount <= 0 for line_amount, _, _ in lines):
        raise ValueError("Każda kwota musi być większa od zera.")
    assigned = sum((line_amount for line_amount, _, _ in lines), Decimal(0))
    if assigned > preview.spent:
        raise ValueError(f"Wydano {preview.spent} {currency}, a przypisujesz {assigned}.")
    if start_cost is not None and start_cost < 0:
        raise ValueError("Koszt nie może być ujemny.")
    stored_cost = str(start_cost) if start_cost is not None else None
    with connection:
        if count_id is None:
            count_id = int(connection.execute(
                "INSERT INTO cash_counts(currency, counted_on, amount, start_cost) VALUES (?, ?, ?, ?)",
                (currency, str(counted_on), str(amount), stored_cost),
            ).lastrowid)
        else:
            _remove_lines(connection, previous_lines)
            connection.execute(
                "UPDATE cash_counts SET currency = ?, counted_on = ?, amount = ?, start_cost = ? WHERE id = ?",
                (currency, str(counted_on), str(amount), stored_cost, count_id),
            )
        for line_amount, category, description in lines:
            transaction_id = ledger.add_manual_transaction(
                connection, account=CASH_ACCOUNT, booking_date=counted_on, amount=-line_amount,
                currency=currency, description=description or "Wydatki z gotówki", counterparty=None,
                category_key=category, commit=False, transaction_type=ledger.CASH_COUNT_LINE,
            )
            connection.execute(
                "INSERT INTO cash_count_entries(transaction_id, count_id) VALUES (?, ?)", (transaction_id, count_id)
            )
    return count_id


def delete_count(connection: sqlite3.Connection, count_id: int) -> None:
    lines = _line_ids(connection, count_id)
    _require_ungrouped(connection, lines)
    with connection:
        _remove_lines(connection, lines)
        connection.execute("DELETE FROM cash_counts WHERE id = ?", (count_id,))


def set_withdrawal_currency(
    connection: sqlite3.Connection, transaction_id: int, currency: str, amount: Decimal,
) -> None:
    row = connection.execute(
        """SELECT t.currency FROM transactions t JOIN transaction_decisions d ON d.transaction_id = t.id
        WHERE t.id = ? AND d.category_key = ?""",
        (transaction_id, CASH_WITHDRAWAL),
    ).fetchone()
    if row is None:
        raise ValueError("To nie jest wypłata z bankomatu.")
    if amount <= 0:
        raise ValueError("Kwota musi być większa od zera.")
    if currency == row["currency"]:
        raise ValueError("Wybierz walutę, w której bankomat wydał gotówkę.")
    with connection:
        connection.execute(
            """INSERT INTO cash_foreign_withdrawals(transaction_id, currency, amount) VALUES (?, ?, ?)
            ON CONFLICT(transaction_id) DO UPDATE SET currency = excluded.currency, amount = excluded.amount""",
            (transaction_id, currency, str(amount)),
        )


def clear_withdrawal_currency(connection: sqlite3.Connection, transaction_id: int) -> None:
    with connection:
        connection.execute("DELETE FROM cash_foreign_withdrawals WHERE transaction_id = ?", (transaction_id,))


def save_exchange(
    connection: sqlite3.Connection, *, exchange_id: int | None = None, exchanged_on: date, given_currency: str,
    given_amount: Decimal, received_currency: str, received_amount: Decimal,
) -> int:
    if given_currency == received_currency:
        raise ValueError("Wybierz dwie różne waluty.")
    if given_amount <= 0 or received_amount <= 0:
        raise ValueError("Obie kwoty muszą być większe od zera.")
    values = (str(exchanged_on), given_currency, str(given_amount), received_currency, str(received_amount))
    with connection:
        if exchange_id is None:
            return int(connection.execute(
                """INSERT INTO cash_exchanges
                (exchanged_on, given_currency, given_amount, received_currency, received_amount)
                VALUES (?, ?, ?, ?, ?)""",
                values,
            ).lastrowid)
        if connection.execute(
            """UPDATE cash_exchanges SET exchanged_on = ?, given_currency = ?, given_amount = ?, received_currency = ?,
            received_amount = ? WHERE id = ?""",
            (*values, exchange_id),
        ).rowcount == 0:
            raise ValueError("Wymiana nie istnieje.")
    return exchange_id


def delete_exchange(connection: sqlite3.Connection, exchange_id: int) -> None:
    with connection:
        connection.execute("DELETE FROM cash_exchanges WHERE id = ?", (exchange_id,))


def spending_items(connection: sqlite3.Connection) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    state = cash_state(connection)
    for exchange in state.exchanges:
        result = exchange.get("fx_result")
        if result:
            items.append({
                "transaction_id": None, "date": exchange["date"], "amount": abs(result),
                "currency": HOME_CURRENCY, "kind": "income" if result > 0 else "expense",
                "category": "fx_result", "label": "Różnice kursowe", "merchant": "Wymiana w kantorze",
            })
    for count in state.counts:
        rate = count.spent_pln / count.spent if count.spent and count.spent_pln is not None else None
        if count.unassigned > 0:
            items.append(
                _item(count, count.unassigned, rate, "uncategorized_expense", "Niesklasyfikowane wydatki", None)
            )
    return items


def _item(
    count: Count, amount: Decimal, rate: Decimal | None, category: str, label: str, description: str | None,
) -> dict[str, object]:
    pln = amount if count.currency == HOME_CURRENCY else (amount * rate).quantize(MONEY) if rate is not None else None
    return {
        "transaction_id": None, "date": count.counted_on, "amount": amount, "currency": count.currency,
        "pln": pln, "kind": "expense", "category": category, "label": label,
        "merchant": description or CASH_ACCOUNT,
    }
