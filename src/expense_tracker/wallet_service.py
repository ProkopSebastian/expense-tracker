"""Pots of money the bank statements do not fully describe: cash, and foreign currency."""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import nullcontext
from decimal import Decimal
from typing import Any

from . import ledger
from .database import insert_transaction
from .models import Transaction

HOME_CURRENCY = "PLN"
COST_PRECISION = Decimal("0.000001")
MONEY = Decimal("0.01")


def wallet_account(currency: str) -> str:
    return f"Portfel {currency}"


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
    return (stamp if stamp.startswith(day) else day, int(row["id"]))


def _wallets(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    return connection.execute(
        "SELECT id, account, currency FROM wallets ORDER BY currency, account COLLATE NOCASE"
    ).fetchall()


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


def wallet_states(connection: sqlite3.Connection) -> dict[int, dict[str, Any]]:
    wallets = _wallets(connection)
    by_pot = {(row["account"], row["currency"]): int(row["id"]) for row in wallets}
    state: dict[int, dict[str, Any]] = {
        int(row["id"]): {
            "balance": Decimal(0),
            "average_cost": Decimal(0),
            "uncovered": Decimal(0),
            "history": [],
        }
        for row in wallets
    }
    if not by_pot:
        return state

    legs = _exchange_legs(connection)
    member_ids = {int(leg["id"]) for group in legs.values() for leg in group}
    placeholders = " OR ".join("(account = ? AND currency = ?)" for _ in by_pot)
    plain = connection.execute(
        f"""SELECT id, account, booking_date, amount, currency, description, raw_json
        FROM transactions WHERE {placeholders}""",
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

    for _, kind, payload in events:
        if kind == "exchange":
            _apply_exchange(state, by_pot, payload)
        else:
            _apply_movement(state, by_pot, payload)
    return state


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
        cost = (given * source_state["average_cost"]).quantize(MONEY)
        source_state["balance"] -= given
        source_state["history"].append(
            {
                "transaction_id": int(source["id"]),
                "kind": "conversion_out",
                "date": source["booking_date"],
                "description": source["description"],
                "amount": str(-given),
                "pln": str(-cost),
            }
        )
    else:
        cost = given

    if target_id is None:
        return
    received = _decimal(target["amount"])
    pot = state[target_id]
    new_balance = pot["balance"] + received
    if new_balance > 0:
        pot["average_cost"] = ((pot["balance"] * pot["average_cost"] + cost) / new_balance).quantize(COST_PRECISION)
    pot["balance"] = new_balance
    pot["history"].append(
        {
            "transaction_id": int(target["id"]),
            "kind": "topup",
            "date": target["booking_date"],
            "description": target["description"],
            "amount": str(received),
            "pln": str(cost),
            "rate": str((cost / received).quantize(COST_PRECISION)) if received else None,
        }
    )


def _apply_movement(state, by_pot, row) -> None:
    pot = state[by_pot[(row["account"], row["currency"])]]
    amount = _decimal(row["amount"])
    if amount < 0:
        spent = -amount
        # An import can outrun the recorded funding. The bank is right, so the row stands and
        # only the part with a known cost is valued; the rest is reported as uncovered.
        covered = min(spent, pot["balance"]) if pot["balance"] > 0 else Decimal(0)
        pot["uncovered"] += spent - covered
        pot["balance"] -= spent
        pot["history"].append(
            {
                "transaction_id": int(row["id"]),
                "kind": "spend",
                "date": row["booking_date"],
                "description": row["description"],
                "amount": str(amount),
                "pln": str(-(covered * pot["average_cost"]).quantize(MONEY)),
                "uncovered": str(spent - covered),
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
            "pln": str((amount * pot["average_cost"]).quantize(MONEY)),
            "rate_known": pot["average_cost"] > 0,
        }
    )


def list_wallets(connection: sqlite3.Connection) -> list[dict[str, object]]:
    state = wallet_states(connection)
    return [
        {
            "id": int(row["id"]),
            "account": row["account"],
            "currency": row["currency"],
            "balance": str(state[int(row["id"])]["balance"].quantize(MONEY)),
            "average_cost": (
                str(state[int(row["id"])]["average_cost"]) if state[int(row["id"])]["average_cost"] > 0 else None
            ),
            "pln_value": str(
                (state[int(row["id"])]["balance"] * state[int(row["id"])]["average_cost"]).quantize(MONEY)
            ),
            "uncovered": str(state[int(row["id"])]["uncovered"].quantize(MONEY)),
        }
        for row in _wallets(connection)
    ]


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


def delete_wallet(connection: sqlite3.Connection, wallet_id: int) -> None:
    row = connection.execute("SELECT account, currency FROM wallets WHERE id = ?", (wallet_id,)).fetchone()
    if row is None:
        raise ValueError("Portfel nie istnieje.")
    if connection.execute(
        "SELECT 1 FROM transactions WHERE account = ? AND currency = ? LIMIT 1", (row["account"], row["currency"])
    ).fetchone():
        raise ValueError("Portfel ma transakcje i nie można go usunąć. Najpierw rozwiąż jego wymiany.")
    connection.execute("DELETE FROM wallets WHERE id = ?", (wallet_id,))
    connection.commit()


def fund_wallet(
    connection: sqlite3.Connection,
    *,
    wallet_id: int,
    source_transaction_id: int,
    received_amount: Decimal | None = None,
    target_transaction_id: int | None = None,
    fee_amount: Decimal = Decimal(0),
    fee_category_key: str | None = None,
    commit: bool = True,
) -> int:
    """Link an outflow to the money it became.

    A kantor or ATM leaves no record of the receiving side, so it is created here. A Revolut
    conversion exports both sides, and then `target_transaction_id` names the row that already
    exists — inventing a second one would double the wallet's balance.
    """
    wallet = connection.execute("SELECT account, currency FROM wallets WHERE id = ?", (wallet_id,)).fetchone()
    if wallet is None:
        raise ValueError("Portfel nie istnieje.")
    if target_transaction_id is None and (received_amount is None or received_amount <= 0):
        raise ValueError("Otrzymana kwota musi być większa od zera.")
    source = connection.execute(
        "SELECT id, account, booking_date, amount, currency FROM transactions WHERE id = ?",
        (source_transaction_id,),
    ).fetchone()
    if source is None:
        raise ValueError("Transakcja nie istnieje.")
    if connection.execute("SELECT 1 FROM case_members WHERE transaction_id = ?", (source_transaction_id,)).fetchone():
        raise ValueError("Transakcja należy do grupy. Najpierw rozwiąż grupę.")
    if _decimal(source["amount"]) >= 0:
        raise ValueError("Zasilenie musi wychodzić z transakcji pomniejszającej saldo.")
    if source["account"] == wallet["account"] and source["currency"] == wallet["currency"]:
        raise ValueError("Transakcja źródłowa należy do tego samego portfela.")

    label = _transfer_label(source["currency"], wallet["account"], wallet["currency"])
    if target_transaction_id is not None:
        target = connection.execute(
            "SELECT id, account, amount, currency FROM transactions WHERE id = ?", (target_transaction_id,)
        ).fetchone()
        if target is None:
            raise ValueError("Transakcja docelowa nie istnieje.")
        if target_transaction_id == source_transaction_id:
            raise ValueError("Wymiana potrzebuje dwóch różnych transakcji.")
        if connection.execute(
            "SELECT 1 FROM case_members WHERE transaction_id = ?", (target_transaction_id,)
        ).fetchone():
            raise ValueError("Transakcja docelowa należy już do grupy.")
        if _decimal(target["amount"]) <= 0:
            raise ValueError("Transakcja docelowa musi powiększać saldo.")
        if target["account"] != wallet["account"] or target["currency"] != wallet["currency"]:
            raise ValueError("Transakcja docelowa nie należy do tego portfela.")

    with connection if commit else nullcontext():
        if target_transaction_id is not None:
            leg_id = target_transaction_id
        else:
            leg = Transaction(
                account=wallet["account"],
                booking_date=source["booking_date"],
                amount=received_amount,
                currency=wallet["currency"],
                description=label,
                external_id=uuid.uuid4().hex,
                raw={"Type": ledger.SYNTHETIC_EXCHANGE_LEG},
            )
            leg_id = insert_transaction(connection, leg, commit=False)
            if leg_id is None:
                raise ValueError("Nie udało się zapisać zasilenia portfela.")
        if fee_amount > 0:
            ledger.add_manual_transaction(
                connection,
                account=source["account"],
                booking_date=source["booking_date"],
                amount=-fee_amount,
                currency=source["currency"],
                description="Opłata za wymianę walut",
                counterparty=None,
                category_key=fee_category_key or "fees_fx",
            )
        return ledger.create_case(
            connection,
            "wallet_exchange",
            label,
            "transfer_own",
            Decimal(0),
            wallet["currency"],
            [(source_transaction_id, "account_transfer"), (leg_id, "account_transfer")],
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
        WHERE t.transaction_type = 'Exchange' AND cm.transaction_id IS NULL"""
    ).fetchall()

    by_moment: dict[str, list[sqlite3.Row]] = {}
    for row in rows:
        moment = json.loads(row["raw_json"] or "{}").get("Started Date")
        if moment:
            by_moment.setdefault(str(moment), []).append(row)

    paired = 0
    for candidates in by_moment.values():
        outgoing = [row for row in candidates if _decimal(row["amount"]) < 0]
        incoming = [row for row in candidates if _decimal(row["amount"]) > 0]
        if len(candidates) != 2 or len(outgoing) != 1 or len(incoming) != 1:
            continue
        source, target = outgoing[0], incoming[0]
        if source["currency"] == target["currency"]:
            continue
        # Selling foreign currency back into złoty realises a gain or loss against the wallet's
        # cost. Linking it here would quietly swallow that difference, so it stays manual.
        if target["currency"] == HOME_CURRENCY:
            continue
        wallet = connection.execute(
            "SELECT id FROM wallets WHERE account = ? AND currency = ?",
            (target["account"], target["currency"]),
        ).fetchone()
        wallet_id = (
            int(wallet["id"])
            if wallet
            else create_wallet(connection, target["account"], target["currency"], commit=False)
        )
        fund_wallet(
            connection,
            wallet_id=wallet_id,
            source_transaction_id=int(source["id"]),
            target_transaction_id=int(target["id"]),
            commit=False,
        )
        paired += 1
    return paired
