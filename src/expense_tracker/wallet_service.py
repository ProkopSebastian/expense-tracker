"""Pots of money the bank statements do not fully describe: cash, and foreign currency."""

from __future__ import annotations

import sqlite3

HOME_CURRENCY = "PLN"
DEFAULT_CASH_ACCOUNT = "Gotówka"


def list_wallets(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute(
        "SELECT id, account, currency FROM wallets ORDER BY currency, account COLLATE NOCASE"
    ).fetchall()
    # Balance and cost are replayed from transactions, which no wallet has yet.
    return [
        {
            "id": row["id"],
            "account": row["account"],
            "currency": row["currency"],
            "balance": "0",
            "average_cost": None,
            "pln_value": "0",
        }
        for row in rows
    ]


def create_wallet(connection: sqlite3.Connection, account: str, currency: str) -> int:
    if connection.execute(
        "SELECT 1 FROM wallets WHERE account = ? AND currency = ?", (account, currency)
    ).fetchone():
        raise ValueError("Portfel dla tego konta i waluty już istnieje.")
    cursor = connection.execute("INSERT INTO wallets(account, currency) VALUES (?, ?)", (account, currency))
    connection.commit()
    return int(cursor.lastrowid)
