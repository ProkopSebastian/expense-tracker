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


def test_selling_imported_currency_reuses_the_bank_outflow(database):
    wallet_id = open_wallet(database, amount="200", cost="800")
    raw = {"Type": "Exchange", "Started Date": "2026-01-02 10:00:00"}
    outflow = add(database, "-100", raw=raw)
    proceeds = add(database, "450", currency="PLN", raw=raw)
    case_id = wallets.sell_wallet(
        database.connection, wallet_id=wallet_id, proceeds_transaction_id=proceeds, given_amount=Decimal(100),
    )
    assert wallets.wallet_balance(database.connection, wallet_id) == 100
    members = database.connection.execute("SELECT transaction_id FROM case_members WHERE case_id=?", (case_id,))
    assert {row[0] for row in members} == {outflow, proceeds}
    assert database.connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 3
