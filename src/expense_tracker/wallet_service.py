"""Pots of money the bank statements do not fully describe: cash, and foreign currency."""

from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Sequence
from contextlib import nullcontext
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from . import ledger
from .database import insert_transaction
from .models import Transaction

HOME_CURRENCY = "PLN"
OPENING_BALANCE = "wallet_opening"
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
    if not stamp.startswith(day):
        time = "00:00:00" if raw.get("Type") == OPENING_BALANCE else "23:59:59.999999"
        stamp = f"{day} {time}"
    return stamp, int(row["id"])


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
    balance, average = pot["balance"], pot["average_cost"]
    if cost is None or (balance > 0 and average is None):
        pot["average_cost"] = None
    elif balance <= 0:
        pot["average_cost"] = (cost / amount).quantize(COST_PRECISION)
    else:
        pot["average_cost"] = ((balance * average + cost) / (balance + amount)).quantize(COST_PRECISION)
    pot["balance"] += amount


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
        covered = min(given, max(source_state["balance"], Decimal(0)))
        cost = (given * average).quantize(MONEY) if average is not None and covered == given else None
        source_state["uncovered"] += given - covered
        source_state["balance"] -= given
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
                "pln": str(-(covered * pot["average_cost"]).quantize(MONEY))
                if pot["average_cost"] is not None else None,
                "uncovered": str(spent - covered),
            }
        )
        return
    opening = json.loads(row["raw_json"] or "{}")
    if opening.get("Type") == OPENING_BALANCE:
        cost = _decimal(opening.get("pln_cost", 0))
        _add_funding(pot, amount, amount if row["currency"] == HOME_CURRENCY else cost)
        pot["history"].append(
            {
                "transaction_id": int(row["id"]),
                "kind": "topup",
                "date": row["booking_date"],
                "description": row["description"],
                "amount": str(amount),
                "pln": str(cost),
                "rate": str((cost / amount).quantize(COST_PRECISION)) if amount else None,
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
    for row in _wallets(connection):
        state = states[int(row["id"])]
        average = state["average_cost"]
        result.append({
            "id": int(row["id"]),
            "account": row["account"],
            "currency": row["currency"],
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
                commit=False,
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
        WHERE t.transaction_type = 'Exchange' AND cm.transaction_id IS NULL
        AND t.bank_status NOT IN ('DECLINED', 'REVERTED', 'FAILED')"""
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


def wallet_balance(connection: sqlite3.Connection, wallet_id: int, on_date: date | None = None) -> Decimal:
    before = (f"{on_date}~", 0) if on_date is not None else None
    state = wallet_states(connection, before=before)
    if wallet_id not in state:
        raise ValueError("Portfel nie istnieje.")
    return state[wallet_id]["balance"]


def reconcile_wallet(
    connection: sqlite3.Connection,
    *,
    wallet_id: int,
    remaining: Decimal,
    booking_date: date,
    lines: Sequence[tuple[Decimal, str, str]],
) -> list[int]:
    """Turn "this much is left" into the spending that must have happened.

    Cash carries no statement, so the amount that disappeared is known exactly while its
    purpose is not. The total is therefore taken from the balance and only the split across
    categories comes from the user.
    """
    wallet = connection.execute("SELECT account, currency FROM wallets WHERE id = ?", (wallet_id,)).fetchone()
    if wallet is None:
        raise ValueError("Portfel nie istnieje.")
    if remaining < 0:
        raise ValueError("Pozostała kwota nie może być ujemna.")

    balance = wallet_balance(connection, wallet_id, booking_date)
    missing = balance - remaining
    if missing < 0:
        # More money than the wallet was ever given means a funding nobody recorded. Booking it
        # as an inflow would assign it a cost of nothing and drag the average cost down.
        raise ValueError(
            f"W portfelu jest {balance} {wallet['currency']}, a podajesz {remaining}. "
            "Brakuje zapisanego zasilenia — dodaj je najpierw."
        )
    if missing == 0:
        raise ValueError("Saldo już się zgadza, nie ma czego rozliczać.")
    if not lines:
        raise ValueError("Podaj, na co poszły pieniądze.")
    if sum((amount for amount, _, _ in lines), Decimal(0)) != missing:
        raise ValueError(f"Kwoty muszą sumować się do {missing} {wallet['currency']}.")

    if any(amount <= 0 for amount, _, _ in lines):
        raise ValueError("Każda kwota musi być większa od zera.")

    created: list[int] = []
    with connection:
        for amount, category_key, description in lines:
            created.append(
                ledger.add_manual_transaction(
                    connection,
                    account=wallet["account"],
                    booking_date=booking_date,
                    amount=-amount,
                    currency=wallet["currency"],
                    description=description,
                    counterparty=None,
                    category_key=category_key,
                    commit=False,
                )
            )
    return created


def _synthetic_leg(
    connection: sqlite3.Connection,
    *,
    account: str,
    booking_date: date,
    amount: Decimal,
    currency: str,
    description: str,
    raw: dict[str, str] | None = None,
) -> int:
    leg = Transaction(
        account=account,
        booking_date=booking_date,
        amount=amount,
        currency=currency,
        description=description,
        external_id=uuid.uuid4().hex,
        raw=raw or {"Type": ledger.SYNTHETIC_EXCHANGE_LEG},
    )
    leg_id = insert_transaction(connection, leg, commit=False)
    if leg_id is None:
        raise ValueError("Nie udało się zapisać operacji portfela.")
    return leg_id


def _require_wallet(connection: sqlite3.Connection, wallet_id: int) -> sqlite3.Row:
    wallet = connection.execute("SELECT id, account, currency FROM wallets WHERE id = ?", (wallet_id,)).fetchone()
    if wallet is None:
        raise ValueError("Portfel nie istnieje.")
    return wallet


def convert_wallet(
    connection: sqlite3.Connection,
    *,
    wallet_id: int,
    target_wallet_id: int,
    given_amount: Decimal,
    received_amount: Decimal,
    booking_date: date,
) -> int:
    """Exchange one pot straight into another, as a kantor abroad does with cash.

    No złoty changes hands, so no new rate is invented: the dirhams inherit exactly what the
    euro spent on them had cost, and no gain or loss can appear out of the conversion itself.
    """
    source = _require_wallet(connection, wallet_id)
    target = _require_wallet(connection, target_wallet_id)
    if wallet_id == target_wallet_id:
        raise ValueError("Wybierz dwa różne portfele.")
    if given_amount <= 0 or received_amount <= 0:
        raise ValueError("Obie kwoty muszą być większe od zera.")
    balance = wallet_balance(connection, wallet_id, booking_date)
    if given_amount > balance:
        raise ValueError(f"Portfel ma {balance} {source['currency']}, a wymieniasz {given_amount}.")

    with connection:
        out_id = _synthetic_leg(
            connection,
            account=source["account"],
            booking_date=booking_date,
            amount=-given_amount,
            currency=source["currency"],
            description=f"Wymiana na {target['currency']}",
        )
        in_id = _synthetic_leg(
            connection,
            account=target["account"],
            booking_date=booking_date,
            amount=received_amount,
            currency=target["currency"],
            description=f"Wymiana na {target['currency']}",
        )
        return ledger.create_case(
            connection,
            "wallet_exchange",
            f"Wymiana {source['currency']} na {target['currency']}",
            "transfer_own",
            Decimal(0),
            target["currency"],
            [(out_id, "account_transfer"), (in_id, "account_transfer")],
            commit=False,
        )


def _sale_source(
    connection: sqlite3.Connection, wallet: sqlite3.Row, proceeds: sqlite3.Row,
    given_amount: Decimal, source_transaction_id: int | None,
) -> sqlite3.Row | None:
    if source_transaction_id is not None:
        source = connection.execute("SELECT * FROM transactions WHERE id = ?", (source_transaction_id,)).fetchone()
        if source is None:
            raise ValueError("Transakcja rozchodowa nie istnieje.")
        if (source["account"], source["currency"]) != (wallet["account"], wallet["currency"]):
            raise ValueError("Transakcja rozchodowa nie należy do wybranego portfela.")
        if _decimal(source["amount"]) != -given_amount:
            raise ValueError("Kwota sprzedaży musi być zgodna z transakcją rozchodową.")
        if source["bank_status"] in {"DECLINED", "REVERTED", "FAILED"}:
            raise ValueError("Transakcja rozchodowa została cofnięta przez bank.")
        if connection.execute("SELECT 1 FROM case_members WHERE transaction_id = ?", (source["id"],)).fetchone():
            raise ValueError("Transakcja rozchodowa należy już do grupy.")
        return source
    if proceeds["transaction_type"] != "Exchange":
        return None
    if wallet["account"] != proceeds["account"]:
        raise ValueError("Zaznacz obie strony odsprzedaży między różnymi rachunkami.")
    moment = json.loads(proceeds["raw_json"] or "{}").get("Started Date")
    candidates = connection.execute(
        """SELECT t.* FROM transactions t LEFT JOIN case_members cm ON cm.transaction_id = t.id
        WHERE t.account = ? AND t.currency = ? AND t.transaction_type = 'Exchange'
        AND t.bank_status NOT IN ('DECLINED', 'REVERTED', 'FAILED') AND cm.transaction_id IS NULL""",
        (wallet["account"], wallet["currency"]),
    ).fetchall()
    matches = [row for row in candidates if moment and _decimal(row["amount"]) == -given_amount
               and json.loads(row["raw_json"] or "{}").get("Started Date") == moment]
    if len(matches) != 1:
        raise ValueError("Zaznacz obie strony odsprzedaży z wyciągu albo zaimportuj brakującą transakcję.")
    return matches[0]


@dataclass(frozen=True)
class _SaleDetails:
    wallet: sqlite3.Row
    proceeds: sqlite3.Row
    source: sqlite3.Row | None
    basis: Decimal

    @property
    def difference(self) -> Decimal:
        return _decimal(self.proceeds["amount"]) - self.basis


def _sale_details(
    connection: sqlite3.Connection, wallet_id: int, proceeds_transaction_id: int,
    given_amount: Decimal, source_transaction_id: int | None,
) -> _SaleDetails:
    wallet = _require_wallet(connection, wallet_id)
    if wallet["currency"] == HOME_CURRENCY:
        raise ValueError("Ten portfel trzyma złotówki, nie ma czego odsprzedawać.")
    if given_amount <= 0:
        raise ValueError("Kwota musi być większa od zera.")
    proceeds = connection.execute(
        "SELECT * FROM transactions WHERE id = ?",
        (proceeds_transaction_id,),
    ).fetchone()
    if proceeds is None:
        raise ValueError("Transakcja z wpłatą nie istnieje.")
    if proceeds["currency"] != HOME_CURRENCY:
        raise ValueError("Odsprzedaż wymaga wpływu w PLN. Wymianę na inną walutę zapisz jako wymianę portfeli.")
    if proceeds["bank_status"] in {"DECLINED", "REVERTED", "FAILED"}:
        raise ValueError("Wpłata została cofnięta przez bank.")
    if connection.execute("SELECT 1 FROM case_members WHERE transaction_id = ?", (proceeds_transaction_id,)).fetchone():
        raise ValueError("Ta transakcja należy już do grupy.")
    if _decimal(proceeds["amount"]) <= 0:
        raise ValueError("Wybierz transakcję, na której pieniądze wpłynęły.")

    source = _sale_source(connection, wallet, proceeds, given_amount, source_transaction_id)
    ordering = min(_ordering(source), _ordering(proceeds)) if source is not None else _ordering(proceeds)
    state = wallet_states(connection, before=ordering)[wallet_id]
    available = state["balance"]
    if given_amount > available:
        raise ValueError(f"Portfel ma {state['balance']} {wallet['currency']}, a sprzedajesz {given_amount}.")
    if state["average_cost"] is None:
        raise ValueError("Brakuje kosztu zakupu sprzedawanej waluty. Uzupełnij wcześniejsze zasilenie portfela.")
    basis = (given_amount * state["average_cost"]).quantize(MONEY)
    return _SaleDetails(wallet, proceeds, source, basis)



def sale_preview(
    connection: sqlite3.Connection, *, wallet_id: int, proceeds_transaction_id: int,
    given_amount: Decimal, source_transaction_id: int | None = None,
) -> dict[str, str]:
    details = _sale_details(connection, wallet_id, proceeds_transaction_id, given_amount, source_transaction_id)
    return {"basis": str(details.basis), "difference": str(details.difference)}


def sell_wallet(
    connection: sqlite3.Connection,
    *,
    wallet_id: int,
    proceeds_transaction_id: int,
    given_amount: Decimal,
    source_transaction_id: int | None = None,
) -> int:
    """Sell foreign currency back, against money that actually arrived on an account.

    Most of the proceeds are the user's own money returning and must not read as income. Only
    the difference from what the currency cost is real, and that difference is booked on its
    own as an exchange-rate result.
    """
    details = _sale_details(connection, wallet_id, proceeds_transaction_id, given_amount, source_transaction_id)
    wallet, proceeds, source = details.wallet, details.proceeds, details.source
    difference = details.difference

    with connection:
        out_id = int(source["id"]) if source is not None else _synthetic_leg(
            connection,
            account=wallet["account"],
            booking_date=proceeds["booking_date"],
            amount=-given_amount,
            currency=wallet["currency"],
            description=f"Odsprzedaż {wallet['currency']}",
            raw={"Type": ledger.SYNTHETIC_EXCHANGE_LEG, "Started Date": _ordering(proceeds)[0]},
        )
        return ledger.create_case(
            connection,
            "wallet_exchange",
            f"Odsprzedaż {wallet['currency']}",
            "fx_result" if difference else "transfer_own",
            # A positive personal_amount reads as an expense, so a gain is carried negative.
            -difference,
            HOME_CURRENCY,
            [(proceeds_transaction_id, "account_transfer"), (out_id, "account_transfer")],
            commit=False,
        )


def set_opening_balance(
    connection: sqlite3.Connection,
    *,
    wallet_id: int,
    amount: Decimal,
    pln_cost: Decimal,
    booking_date: date,
) -> int:
    """Record money already held, with what it cost, when no exchange was ever captured."""
    wallet = _require_wallet(connection, wallet_id)
    if amount <= 0:
        raise ValueError("Kwota musi być większa od zera.")
    if pln_cost < 0:
        raise ValueError("Koszt nie może być ujemny.")
    with connection:
        leg_id = _synthetic_leg(
            connection,
            account=wallet["account"],
            booking_date=booking_date,
            amount=amount,
            currency=wallet["currency"],
            description="Saldo otwarcia",
            raw={"Type": OPENING_BALANCE, "pln_cost": str(pln_cost)},
        )
        # Marked as a transfer so money that was already the user's does not read as income.
        ledger.save_decision(connection, leg_id, "transfer_own", "Saldo otwarcia portfela", commit=False)
    return leg_id
