from datetime import date
from decimal import Decimal

from expense_tracker import wallet_service as wallets
from expense_tracker.models import Transaction


def add(database, amount, currency="EUR", day="2026-01-02", account="test", raw=None):
    return database.insert_transaction(Transaction(
        account=account, booking_date=date.fromisoformat(day), amount=Decimal(amount),
        currency=currency, description="Test", raw=raw,
    ))


def open_wallet(database, amount="100", cost="400", day="2026-01-01", currency="EUR", account="test"):
    wallet_id = wallets.create_wallet(database.connection, account, currency)
    wallets.set_opening_balance(
        database.connection, wallet_id=wallet_id, amount=Decimal(amount), pln_cost=Decimal(cost),
        booking_date=date.fromisoformat(day),
    )
    return wallet_id


def test_reverted_payment_restores_wallet_balance(database):
    wallet_id = open_wallet(database)
    raw = {"Type": "Card Payment", "Started Date": "2026-01-02 10:00:00", "State": "PENDING"}
    add(database, "-20", raw=raw)
    assert wallets.wallet_balance(database.connection, wallet_id) == 80
    add(database, "-20", raw=raw | {"State": "REVERTED"})
    assert wallets.wallet_balance(database.connection, wallet_id) == 100
    assert len(wallets.wallet_history(database.connection, wallet_id)) == 1
