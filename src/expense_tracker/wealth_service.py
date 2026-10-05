from __future__ import annotations

import sqlite3
from collections.abc import Mapping, Sequence
from datetime import date
from decimal import Decimal

HOME_CURRENCY = "PLN"
MONEY = Decimal("0.01")


def _require_asset(connection: sqlite3.Connection, asset_id: int) -> sqlite3.Row:
    asset = connection.execute("SELECT * FROM wealth_assets WHERE id = ?", (asset_id,)).fetchone()
    if asset is None:
        raise ValueError("Składnik majątku nie istnieje.")
    return asset


def _require_snapshot(connection: sqlite3.Connection, snapshot_id: int) -> None:
    if not connection.execute("SELECT 1 FROM wealth_snapshots WHERE id = ?", (snapshot_id,)).fetchone():
        raise ValueError("Ten stan majątku nie istnieje.")


def _require_unique_name(connection: sqlite3.Connection, name: str, asset_id: int | None = None) -> None:
    if connection.execute("SELECT 1 FROM wealth_assets WHERE name = ? AND id IS NOT ?", (name, asset_id)).fetchone():
        raise ValueError("Składnik o tej nazwie już istnieje.")


def create_asset(
    connection: sqlite3.Connection, *, name: str, kind: str, currency: str, institution: str | None
) -> int:
    _require_unique_name(connection, name)
    cursor = connection.execute(
        "INSERT INTO wealth_assets(name, kind, currency, institution) VALUES (?, ?, ?, ?)",
        (name, kind, currency, institution or None),
    )
    connection.commit()
    return int(cursor.lastrowid)


def update_asset(
    connection: sqlite3.Connection,
    asset_id: int,
    *,
    name: str,
    kind: str,
    institution: str | None,
    is_active: bool,
) -> None:
    _require_asset(connection, asset_id)
    _require_unique_name(connection, name, asset_id)
    connection.execute(
        "UPDATE wealth_assets SET name = ?, kind = ?, institution = ?, is_active = ? WHERE id = ?",
        (name, kind, institution or None, int(is_active), asset_id),
    )
    connection.commit()


def delete_asset(connection: sqlite3.Connection, asset_id: int) -> None:
    _require_asset(connection, asset_id)
    if connection.execute("SELECT 1 FROM wealth_balances WHERE asset_id = ? LIMIT 1", (asset_id,)).fetchone():
        raise ValueError("Składnik ma zapisaną historię. Zamiast go usuwać, oznacz go jako nieaktywny.")
    connection.execute("DELETE FROM wealth_assets WHERE id = ?", (asset_id,))
    connection.commit()


def save_snapshot(
    connection: sqlite3.Connection,
    *,
    day: date,
    balances: Sequence[tuple[int, Decimal]],
    rates: Mapping[str, Decimal],
    snapshot_id: int | None = None,
) -> int:
    if not balances:
        raise ValueError("Podaj kwotę co najmniej jednego składnika.")
    if len({asset_id for asset_id, _ in balances}) != len(balances):
        raise ValueError("Każdy składnik może mieć tylko jedną kwotę.")
    # Recording a day that already has a snapshot replaces it; only an explicit edit may not collide.
    same_day = connection.execute("SELECT id FROM wealth_snapshots WHERE day = ?", (str(day),)).fetchone()
    if snapshot_id is None:
        snapshot_id = int(same_day["id"]) if same_day else None
    else:
        _require_snapshot(connection, snapshot_id)
        if same_day and int(same_day["id"]) != snapshot_id:
            raise ValueError(f"Stan na {day:%d.%m.%Y} już istnieje. Popraw go w historii.")

    currencies = {str(_require_asset(connection, asset_id)["currency"]) for asset_id, _ in balances}
    foreign = sorted(currencies - {HOME_CURRENCY})
    missing = [currency for currency in foreign if currency not in rates]
    if missing:
        raise ValueError(f"Podaj kurs {', '.join(missing)} z tego dnia.")

    with connection:
        if snapshot_id is None:
            snapshot_id = int(connection.execute("INSERT INTO wealth_snapshots(day) VALUES (?)", (str(day),)).lastrowid)
        else:
            connection.execute("UPDATE wealth_snapshots SET day = ? WHERE id = ?", (str(day), snapshot_id))
            connection.execute("DELETE FROM wealth_balances WHERE snapshot_id = ?", (snapshot_id,))
            connection.execute("DELETE FROM wealth_rates WHERE snapshot_id = ?", (snapshot_id,))
        connection.executemany(
            "INSERT INTO wealth_balances(snapshot_id, asset_id, amount) VALUES (?, ?, ?)",
            [(snapshot_id, asset_id, str(amount)) for asset_id, amount in balances],
        )
        connection.executemany(
            "INSERT INTO wealth_rates(snapshot_id, currency, rate) VALUES (?, ?, ?)",
            [(snapshot_id, currency, str(rates[currency])) for currency in foreign],
        )
    return snapshot_id


def delete_snapshot(connection: sqlite3.Connection, snapshot_id: int) -> None:
    _require_snapshot(connection, snapshot_id)
    connection.execute("DELETE FROM wealth_snapshots WHERE id = ?", (snapshot_id,))
    connection.commit()


def wealth_overview(connection: sqlite3.Connection) -> dict[str, list[dict[str, object]]]:
    assets = connection.execute("SELECT * FROM wealth_assets ORDER BY name COLLATE NOCASE").fetchall()
    by_id = {int(asset["id"]): asset for asset in assets}
    rates: dict[int, dict[str, Decimal]] = {}
    for row in connection.execute("SELECT snapshot_id, currency, rate FROM wealth_rates ORDER BY currency"):
        rates.setdefault(int(row["snapshot_id"]), {})[row["currency"]] = Decimal(row["rate"])
    balances: dict[int, list[sqlite3.Row]] = {}
    for row in connection.execute("SELECT snapshot_id, asset_id, amount FROM wealth_balances"):
        balances.setdefault(int(row["snapshot_id"]), []).append(row)

    latest: dict[int, dict[str, str | None]] = {}
    snapshots: list[dict[str, object]] = []
    previous_total: Decimal | None = None
    for snapshot in connection.execute("SELECT id, day FROM wealth_snapshots ORDER BY day"):
        snapshot_id = int(snapshot["id"])
        own_rates = rates.get(snapshot_id, {})
        total = Decimal(0)
        by_kind: dict[str, Decimal] = {}
        entries = []
        for row in balances.get(snapshot_id, []):
            asset = by_id[int(row["asset_id"])]
            amount = Decimal(row["amount"])
            # The rate belongs to this snapshot, so a newer rate never reprices an older day.
            rate = None if asset["currency"] == HOME_CURRENCY else own_rates[asset["currency"]]
            pln = (amount * (rate or 1)).quantize(MONEY)
            total += pln
            by_kind[asset["kind"]] = by_kind.get(asset["kind"], Decimal(0)) + pln
            entry = {"asset_id": int(asset["id"]), "amount": str(amount), "pln": str(pln)}
            entries.append(entry)
            latest[entry["asset_id"]] = {
                "day": snapshot["day"],
                "amount": entry["amount"],
                "rate": str(rate) if rate is not None else None,
                "pln": entry["pln"],
            }
        snapshots.append(
            {
                "id": snapshot_id,
                "day": snapshot["day"],
                "total": str(total),
                "change": str(total - previous_total) if previous_total is not None else None,
                "by_kind": {kind: str(value) for kind, value in by_kind.items()},
                "balances": entries,
                "rates": {currency: str(rate) for currency, rate in own_rates.items()},
            }
        )
        previous_total = total

    return {
        "assets": [
            {
                "id": int(asset["id"]),
                "name": asset["name"],
                "kind": asset["kind"],
                "currency": asset["currency"],
                "institution": asset["institution"],
                "is_active": bool(asset["is_active"]),
                "latest": latest.get(int(asset["id"])),
            }
            for asset in assets
        ],
        "snapshots": snapshots,
    }
