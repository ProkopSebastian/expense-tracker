"""Pots of money the bank statements do not fully describe: cash, and foreign currency."""

from __future__ import annotations

import json
import sqlite3
from datetime import date
from decimal import Decimal
from typing import Any

from . import ledger

HOME_CURRENCY = "PLN"
COST_PRECISION = Decimal("0.000001")
MONEY = Decimal("0.01")


def _transfer_label(source_currency: str, wallet_account_name: str, wallet_currency: str) -> str:
    # Taking złoty out of a cash machine exchanges nothing; only a change of currency does.
    if source_currency == wallet_currency:
        return f"Zasilenie: {wallet_account_name}"
    return f"Wymiana na {wallet_currency}"


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value))


def _ordering(row: sqlite3.Row) -> tuple[str, int]:
    # A wallet-to-wallet conversion reads the source wallet's cost at that instant, so two
    # movements on the same day must not be replayed out of order. Bank exports carry a full
    # timestamp; trust it only when it agrees with the booking date it was derived from.
    raw = json.loads(row["raw_json"] or "{}")
    stamp = str(raw.get("Started Date") or "")
    day = str(row["booking_date"])
    if not stamp.startswith(day):
        stamp = f"{day} 23:59:59.999999"
    return stamp, int(row["id"])


def _wallets(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    return connection.execute(
        "SELECT id, account, currency, opening_rate FROM wallets ORDER BY currency, account COLLATE NOCASE"
    ).fetchall()


def _bank_accounts(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute(
        f"""SELECT DISTINCT account FROM transactions WHERE transaction_type IS NOT NULL
        AND transaction_type NOT IN ({",".join("?" * len(ledger.APP_MADE_TYPES))})""",
        ledger.APP_MADE_TYPES,
    ).fetchall()
    return {row["account"] for row in rows}


def _held_before_statements(connection: sqlite3.Connection, account: str, currency: str) -> tuple[Decimal, str] | None:
    """What the account already held before its earliest imported row, and that row's date.

    A statement's running balance reveals money that predates the imported history. Without a
    balance, the smallest starting amount that never lets the account go below zero is used.
    It is recomputed on every read, so importing older statements shrinks it on its own.
    """
    rows = sorted(
        connection.execute(
            """SELECT id, booking_date, amount, balance, raw_json FROM transactions
            WHERE account = ? AND currency = ? AND bank_status NOT IN ('DECLINED', 'REVERTED', 'FAILED')""",
            (account, currency),
        ).fetchall(),
        key=_ordering,
    )
    if not rows:
        return None
    anchor = next((row for row in rows if row["balance"] is not None), None)
    if anchor is not None:
        stamp = _ordering(anchor)[0]
        moved = sum((_decimal(row["amount"]) for row in rows if _ordering(row)[0] <= stamp), Decimal(0))
        held = _decimal(anchor["balance"]) - moved
    else:
        running = lowest = Decimal(0)
        for row in rows:
            running += _decimal(row["amount"])
            lowest = min(lowest, running)
        held = -lowest
    held = held.quantize(MONEY)
    return (held, str(rows[0]["booking_date"])) if held > 0 else None


def _exchange_legs(connection: sqlite3.Connection) -> dict[int, list[sqlite3.Row]]:
    rows = connection.execute(
        """SELECT c.id AS case_id, t.id, t.account, t.booking_date, t.amount, t.currency,
                  t.description, t.raw_json
        FROM cases c JOIN case_members cm ON cm.case_id = c.id JOIN transactions t ON t.id = cm.transaction_id
        WHERE c.kind = 'wallet_exchange' AND c.status = 'approved'"""
    ).fetchall()
    legs: dict[int, list[sqlite3.Row]] = {}
    for row in rows:
        legs.setdefault(int(row["case_id"]), []).append(row)
    return legs


def wallet_states(
    connection: sqlite3.Connection, *, before: tuple[str, int] | None = None,
) -> dict[int, dict[str, Any]]:
    wallets = _wallets(connection)
    by_pot = {(row["account"], row["currency"]): int(row["id"]) for row in wallets}
    state: dict[int, dict[str, Any]] = {
        int(row["id"]): {
            "balance": Decimal(0),
            "average_cost": Decimal(1) if row["currency"] == HOME_CURRENCY else None,
            "uncovered": Decimal(0),
            "unknown": Decimal(0),
            "history": [],
        }
        for row in wallets
    }
    if not by_pot:
        return state

    banks = _bank_accounts(connection)
    for row in wallets:
        if row["account"] not in banks or row["currency"] == HOME_CURRENCY:
            continue
        held = _held_before_statements(connection, row["account"], row["currency"])
        if held is None:
            continue
        amount, day = held
        rate = _decimal(row["opening_rate"]) if row["opening_rate"] is not None else None
        pot = state[int(row["id"])]
        cost = (amount * rate).quantize(MONEY) if rate is not None else None
        if cost is None:
            pot["unknown"] += amount
            pot["balance"] += amount
        else:
            _add_funding(pot, amount, cost)
        pot["held_before"] = {
            "amount": str(amount), "date": day, "rate_known": rate is not None,
            "pln": str(cost) if cost is not None else None,
        }
        pot["history"].append(
            {
                "transaction_id": -int(row["id"]),
                "kind": "held_before",
                "date": day,
                "description": "Saldo sprzed pierwszego wyciągu",
                "amount": str(amount),
                "pln": str(cost) if cost is not None else None,
                "rate": str(rate) if rate is not None else None,
            }
        )

    legs = _exchange_legs(connection)
    member_ids = {int(leg["id"]) for group in legs.values() for leg in group}
    placeholders = " OR ".join("(account = ? AND currency = ?)" for _ in by_pot)
    plain = connection.execute(
        f"""SELECT id, account, booking_date, amount, currency, description, raw_json
        FROM transactions WHERE ({placeholders}) AND bank_status NOT IN ('DECLINED', 'REVERTED', 'FAILED')""",
        [value for pot in by_pot for value in pot],
    ).fetchall()

    events: list[tuple[tuple[str, int], str, Any]] = []
    for row in plain:
        if int(row["id"]) not in member_ids:
            events.append((_ordering(row), "movement", row))
    for group in legs.values():
        if len(group) == 2:
            events.append((min(_ordering(leg) for leg in group), "exchange", group))
    events.sort(key=lambda event: event[0])

    for ordering, kind, payload in events:
        if before is not None and ordering >= before:
            break
        if kind == "exchange":
            _apply_exchange(state, by_pot, payload)
        else:
            _apply_movement(state, by_pot, payload)
    return state


def _add_funding(pot, amount: Decimal, cost: Decimal | None) -> None:
    balance, average = pot["balance"] - pot["unknown"], pot["average_cost"]
    if cost is None or (balance > 0 and average is None):
        pot["average_cost"] = None
    elif balance <= 0:
        pot["average_cost"] = (cost / amount).quantize(COST_PRECISION)
    else:
        pot["average_cost"] = ((balance * average + cost) / (balance + amount)).quantize(COST_PRECISION)
    pot["balance"] += amount


def _take(pot, amount: Decimal) -> tuple[Decimal, Decimal]:
    # Money held before the first statement is the oldest, so it is spent first. Whatever goes
    # beyond everything held is a deficit the statements do not explain.
    from_unknown = min(amount, pot["unknown"])
    known = pot["balance"] - pot["unknown"]
    pot["unknown"] -= from_unknown
    covered = min(amount - from_unknown, max(known, Decimal(0)))
    pot["uncovered"] += amount - from_unknown - covered
    pot["balance"] -= amount
    return covered, amount - covered


def _apply_exchange(state, by_pot, group) -> None:
    incoming = [leg for leg in group if _decimal(leg["amount"]) > 0]
    outgoing = [leg for leg in group if _decimal(leg["amount"]) < 0]
    if not incoming or not outgoing:
        return
    target, source = incoming[0], outgoing[0]
    target_id = by_pot.get((target["account"], target["currency"]))
    source_id = by_pot.get((source["account"], source["currency"]))
    given = -_decimal(source["amount"])

    if source["currency"] == HOME_CURRENCY and source_id is None:
        cost = given
    elif source_id is not None:
        # Converting one pot into another carries the złoty basis across: no złoty changed
        # hands, so no gain or loss may be invented here.
        source_state = state[source_id]
        average = source_state["average_cost"]
        _, unvalued = _take(source_state, given)
        cost = (given * average).quantize(MONEY) if average is not None and not unvalued else None
        source_state["history"].append(
            {
                "transaction_id": int(source["id"]),
                "kind": "conversion_out",
                "date": source["booking_date"],
                "description": source["description"],
                "amount": str(-given),
                "pln": str(-cost) if cost is not None else None,
            }
        )
    else:
        cost = None

    if target_id is None:
        return
    received = _decimal(target["amount"])
    if target["currency"] == HOME_CURRENCY:
        cost = received
    pot = state[target_id]
    _add_funding(pot, received, cost)
    pot["history"].append(
        {
            "transaction_id": int(target["id"]),
            "kind": "topup",
            "date": target["booking_date"],
            "description": target["description"],
            "amount": str(received),
            "pln": str(cost) if cost is not None else None,
            "rate": str((cost / received).quantize(COST_PRECISION)) if cost is not None else None,
        }
    )


def _apply_movement(state, by_pot, row) -> None:
    pot = state[by_pot[(row["account"], row["currency"])]]
    amount = _decimal(row["amount"])
    if amount < 0:
        # An import can outrun the recorded funding. The bank is right, so the row stands and
        # only the part with a known cost is valued; the rest is reported as uncovered.
        covered, unvalued = _take(pot, -amount)
        pot["history"].append(
            {
                "transaction_id": int(row["id"]),
                "kind": "spend",
                "date": row["booking_date"],
                "description": row["description"],
                "amount": str(amount),
                "pln": str(-(covered * pot["average_cost"]).quantize(MONEY))
                if pot["average_cost"] is not None else None,
                "uncovered": str(unvalued),
            }
        )
        return
    # An inflow with no recorded exchange has no known cost; carry it at the running average
    # rather than inventing a rate, and let the page say the rate is missing.
    pot["balance"] += amount
    pot["history"].append(
        {
            "transaction_id": int(row["id"]),
            "kind": "inflow",
            "date": row["booking_date"],
            "description": row["description"],
            "amount": str(amount),
            "pln": str((amount * pot["average_cost"]).quantize(MONEY))
            if pot["average_cost"] is not None else None,
            "rate_known": pot["average_cost"] is not None,
        }
    )


def list_wallets(connection: sqlite3.Connection) -> list[dict[str, object]]:
    states = wallet_states(connection)
    result = []
    banks = _bank_accounts(connection)
    for row in _wallets(connection):
        state = states[int(row["id"])]
        average = state["average_cost"]
        result.append({
            "id": int(row["id"]),
            "account": row["account"],
            "currency": row["currency"],
            "kind": "bank" if row["account"] in banks else "cash",
            "held_before": state.get("held_before"),
            "balance": str(state["balance"].quantize(MONEY)),
            "average_cost": str(average) if average is not None else None,
            "pln_value": str((state["balance"] * average).quantize(MONEY)) if average is not None else None,
            "uncovered": str(state["uncovered"].quantize(MONEY)),
        })
    return result


def pln_equivalents(connection: sqlite3.Connection) -> dict[int, Decimal]:
    """What each foreign-currency transaction is worth in złoty, at the pot's own cost.

    Only movements a wallet could value appear here. A currency with no recorded exchange is
    absent rather than guessed, so callers can tell "nothing to convert" from "worth zero".
    """
    values: dict[int, Decimal] = {}
    for state in wallet_states(connection).values():
        for event in state["history"]:
            if event["kind"] == "spend" and _decimal(event["uncovered"]) > 0:
                continue
            if event["pln"] is not None:
                values[int(event["transaction_id"])] = _decimal(event["pln"])
    return values


def partial_pln_equivalents(connection: sqlite3.Connection) -> dict[int, Decimal | None]:
    return {
        int(event["transaction_id"]): _decimal(event["pln"]) if event["pln"] is not None else None
        for state in wallet_states(connection).values()
        for event in state["history"]
        if event["pln"] is None or _decimal(event.get("uncovered", 0)) > 0
    }


def sale_results(connection: sqlite3.Connection) -> dict[int, tuple[Decimal | None, str]]:
    values = pln_equivalents(connection)
    results = {}
    for case_id, group in _exchange_legs(connection).items():
        incoming = [row for row in group if _decimal(row["amount"]) > 0]
        outgoing = [row for row in group if _decimal(row["amount"]) < 0]
        if len(incoming) != 1 or len(outgoing) != 1:
            continue
        target, source = incoming[0], outgoing[0]
        if target["currency"] != HOME_CURRENCY or source["currency"] == HOME_CURRENCY:
            continue
        cost = values.get(int(source["id"]))
        amount = -cost - _decimal(target["amount"]) if cost is not None else None
        results[case_id] = amount, source["currency"]
    return results


def group_cost_rates(connection: sqlite3.Connection, values: dict[int, Decimal]) -> dict[int, Decimal]:
    rows = connection.execute(
        """SELECT c.id AS case_id, t.id, t.amount
        FROM cases c JOIN case_members cm ON cm.case_id = c.id JOIN transactions t ON t.id = cm.transaction_id
        WHERE c.status = 'approved' AND c.kind != 'wallet_exchange' AND c.currency != 'PLN'
        AND t.currency = c.currency"""
    ).fetchall()
    members: dict[int, list[sqlite3.Row]] = {}
    for row in rows:
        members.setdefault(int(row["case_id"]), []).append(row)
    rates = {}
    for case_id, group in members.items():
        # Personal cost is valued at the weighted acquisition cost of this group's spending,
        # independent of funding or spending outside the group. Income-only groups use inflows.
        outflows = [row for row in group if _decimal(row["amount"]) < 0]
        basis = outflows or [row for row in group if _decimal(row["amount"]) > 0]
        if not basis or any(int(row["id"]) not in values for row in basis):
            continue
        amount = sum((abs(_decimal(row["amount"])) for row in basis), Decimal(0))
        cost = sum((abs(values[int(row["id"])]) for row in basis), Decimal(0))
        rates[case_id] = cost / amount
    return rates


def wallet_history(connection: sqlite3.Connection, wallet_id: int) -> list[dict[str, Any]]:
    state = wallet_states(connection)
    if wallet_id not in state:
        raise ValueError("Portfel nie istnieje.")
    return state[wallet_id]["history"]


def create_wallet(connection: sqlite3.Connection, account: str, currency: str, *, commit: bool = True) -> int:
    if connection.execute("SELECT 1 FROM wallets WHERE account = ? AND currency = ?", (account, currency)).fetchone():
        raise ValueError("Portfel dla tego konta i waluty już istnieje.")
    cursor = connection.execute("INSERT INTO wallets(account, currency) VALUES (?, ?)", (account, currency))
    if commit:
        connection.commit()
    return int(cursor.lastrowid)


def _link_exchange(connection: sqlite3.Connection, *, wallet_id: int, source: sqlite3.Row, target: sqlite3.Row) -> int:
    wallet = _require_wallet(connection, wallet_id)
    label = _transfer_label(source["currency"], wallet["account"], wallet["currency"])
    return ledger.create_case(
        connection,
        "wallet_exchange",
        label,
        "transfer_own",
        Decimal(0),
        wallet["currency"],
        [(int(source["id"]), "account_transfer"), (int(target["id"]), "account_transfer")],
        commit=False,
    )


def pair_exchanges(connection: sqlite3.Connection) -> int:
    """Link the two halves of a bank-recorded currency exchange. Returns how many were linked.

    Both halves carry the same start timestamp down to the second, so matching them is
    bookkeeping rather than inference. Anything less than certain is left to the user: a moment
    without exactly one outgoing and one incoming row is skipped whole, never resolved by
    picking the closest candidate.
    """
    rows = connection.execute(
        """SELECT t.id, t.account, t.amount, t.currency, t.raw_json
        FROM transactions t LEFT JOIN case_members cm ON cm.transaction_id = t.id
        WHERE t.transaction_type = 'Exchange' AND cm.transaction_id IS NULL
        AND t.bank_status NOT IN ('DECLINED', 'REVERTED', 'FAILED')"""
    ).fetchall()

    by_moment: dict[tuple[str, str], list[sqlite3.Row]] = {}
    for row in rows:
        moment = json.loads(row["raw_json"] or "{}").get("Started Date")
        if moment:
            by_moment.setdefault((row["account"], str(moment)), []).append(row)

    paired = 0
    for candidates in by_moment.values():
        outgoing = [row for row in candidates if _decimal(row["amount"]) < 0]
        incoming = [row for row in candidates if _decimal(row["amount"]) > 0]
        if len(candidates) != 2 or len(outgoing) != 1 or len(incoming) != 1:
            continue
        source, target = outgoing[0], incoming[0]
        if source["currency"] == target["currency"]:
            continue
        if target["currency"] == HOME_CURRENCY:
            # The gain or loss against the sold currency's cost is derived on read by
            # sale_results, so it follows any later correction of that cost.
            _ensure_wallet(connection, source["account"], source["currency"])
            ledger.create_case(
                connection,
                "wallet_exchange",
                f"Odsprzedaż {source['currency']}",
                "transfer_own",
                Decimal(0),
                HOME_CURRENCY,
                [(int(target["id"]), "account_transfer"), (int(source["id"]), "account_transfer")],
                commit=False,
            )
        else:
            _link_exchange(
                connection,
                wallet_id=_ensure_wallet(connection, target["account"], target["currency"]),
                source=source,
                target=target,
            )
        paired += 1
    return paired


def track_imported_currencies(connection: sqlite3.Connection) -> None:
    for row in connection.execute(
        f"""SELECT DISTINCT account, currency FROM transactions WHERE currency != ? AND transaction_type IS NOT NULL
        AND transaction_type NOT IN ({",".join("?" * len(ledger.APP_MADE_TYPES))})""",
        (HOME_CURRENCY, *ledger.APP_MADE_TYPES),
    ).fetchall():
        _ensure_wallet(connection, row["account"], row["currency"])


def _ensure_wallet(connection: sqlite3.Connection, account: str, currency: str) -> int:
    wallet = connection.execute(
        "SELECT id FROM wallets WHERE account = ? AND currency = ?", (account, currency)
    ).fetchone()
    return int(wallet["id"]) if wallet else create_wallet(connection, account, currency, commit=False)


def wallet_balance(connection: sqlite3.Connection, wallet_id: int, on_date: date | None = None) -> Decimal:
    before = (f"{on_date}~", 0) if on_date is not None else None
    state = wallet_states(connection, before=before)
    if wallet_id not in state:
        raise ValueError("Portfel nie istnieje.")
    return state[wallet_id]["balance"]


def _require_wallet(connection: sqlite3.Connection, wallet_id: int) -> sqlite3.Row:
    wallet = connection.execute("SELECT id, account, currency FROM wallets WHERE id = ?", (wallet_id,)).fetchone()
    if wallet is None:
        raise ValueError("Portfel nie istnieje.")
    return wallet


def set_opening_rate(connection: sqlite3.Connection, *, wallet_id: int, pln_cost: Decimal) -> None:
    wallet = _require_wallet(connection, wallet_id)
    held = _held_before_statements(connection, wallet["account"], wallet["currency"])
    if held is None:
        raise ValueError("Ta waluta nie ma salda sprzed wyciągów.")
    if pln_cost <= 0:
        raise ValueError("Kwota musi być większa od zera.")
    rate = (pln_cost / held[0]).quantize(COST_PRECISION)
    with connection:
        connection.execute("UPDATE wallets SET opening_rate = ? WHERE id = ?", (str(rate), wallet_id))


def clear_opening_rate(connection: sqlite3.Connection, wallet_id: int) -> None:
    _require_wallet(connection, wallet_id)
    with connection:
        connection.execute("UPDATE wallets SET opening_rate = NULL WHERE id = ?", (wallet_id,))
