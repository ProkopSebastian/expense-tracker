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
    raw = {"Type": "Exchange", "Started Date": f"{day} 00:00:00"}
    add(database, f"-{cost}", currency="PLN", day=day, account=account, raw=raw)
    add(database, amount, currency=currency, day=day, account=account, raw=raw)
    wallets.pair_exchanges(database.connection)
    return database.connection.execute(
        "SELECT id FROM wallets WHERE account = ? AND currency = ?", (account, currency)
    ).fetchone()[0]


def sell(database, amount, proceeds, day, account="test"):
    raw = {"Type": "Exchange", "Started Date": f"{day} 10:00:00"}
    add(database, f"-{amount}", day=day, account=account, raw=raw)
    add(database, proceeds, currency="PLN", day=day, account=account, raw=raw)
    wallets.pair_exchanges(database.connection)


def test_reverted_payment_restores_wallet_balance(database):
    wallet_id = open_wallet(database)
    raw = {"Type": "Card Payment", "Started Date": "2026-01-02 10:00:00", "State": "PENDING"}
    add(database, "-20", raw=raw)
    assert wallets.wallet_balance(database.connection, wallet_id) == 80
    add(database, "-20", raw=raw | {"State": "REVERTED"})
    assert wallets.wallet_balance(database.connection, wallet_id) == 100
    assert len(wallets.wallet_history(database.connection, wallet_id)) == 1


def test_sale_uses_historical_cost_and_reprices_after_earlier_funding(database):
    from expense_tracker.ledger import approved_cases

    open_wallet(database)
    open_wallet(database, cost="600", day="2026-03-01")
    sell(database, "100", "450", "2026-02-01")
    [sale] = [case for case in approved_cases(database.connection) if case["title"] == "Odsprzedaż EUR"]
    assert Decimal(sale["personal_amount"]) == -50
    open_wallet(database, cost="600", day="2026-01-15")
    [sale] = [case for case in approved_cases(database.connection) if case["title"] == "Odsprzedaż EUR"]
    assert Decimal(sale["personal_amount"]) == 50


def test_missing_cost_is_not_reported_as_zero(database):
    from expense_tracker.summary_service import get_summary

    wallets.create_wallet(database.connection, "test", "EUR")
    add(database, "100")
    add(database, "-20", day="2026-01-03")
    result = get_summary(database.connection, month="2026-01")
    assert result.untranslated == ["EUR"]
    assert result.item_count == 0
    assert wallets.list_wallets(database.connection)[0]["pln_value"] is None


def test_uncovered_spending_reports_only_the_known_part(database):
    from expense_tracker.summary_service import get_summary

    open_wallet(database)
    tid = add(database, "-150")
    result = get_summary(database.connection, month="2026-01")
    assert result.expenses == 400
    assert result.untranslated == ["EUR"]
    assert tid not in wallets.pln_equivalents(database.connection)


def test_later_funding_does_not_spread_its_cost_over_an_earlier_deficit(database):
    wallets.create_wallet(database.connection, "test", "EUR")
    add(database, "-20")
    open_wallet(database, day="2026-03-01")
    [wallet] = wallets.list_wallets(database.connection)
    assert wallet["average_cost"] == "4.000000"
    assert wallet["balance"] == "100.00"
    assert wallet["pln_value"] == "400.00"


def test_group_cost_uses_only_historical_rates_of_its_expenses(database):
    from expense_tracker.ledger import create_case
    from expense_tracker.summary_service import get_summary

    open_wallet(database)
    first = add(database, "-20")
    second = add(database, "-20", day="2026-01-03")
    create_case(
        database.connection, "shared_purchase", "Test group", "groceries", Decimal(40), "EUR",
        [(first, "purchase"), (second, "purchase")],
    )
    assert get_summary(database.connection, month="2026-01").expenses == 160
    open_wallet(database, cost="600", day="2026-03-01")
    assert get_summary(database.connection, month="2026-01").expenses == 160
    wallets.create_wallet(database.connection, "other", "EUR")
    assert get_summary(database.connection, month="2026-01").expenses == 160


def test_group_cost_weights_different_historical_rates(database):
    from expense_tracker.ledger import create_case
    from expense_tracker.summary_service import get_summary

    open_wallet(database, amount="10", cost="40")
    open_wallet(database, amount="30", cost="180", account="other")
    first = add(database, "-10")
    second = add(database, "-30", account="other")
    create_case(
        database.connection, "shared_purchase", "Test group", "groceries", Decimal(20), "EUR",
        [(first, "purchase"), (second, "purchase")],
    )
    result = get_summary(database.connection, month="2026-01")
    assert result.expenses == 110
    assert result.untranslated == []


def test_group_with_unknown_member_cost_does_not_borrow_another_wallet_rate(database):
    from expense_tracker.ledger import create_case
    from expense_tracker.summary_service import get_summary

    open_wallet(database)
    first = add(database, "-10")
    second = add(database, "-10", account="other")
    create_case(
        database.connection, "shared_purchase", "Test group", "groceries", Decimal(20), "EUR",
        [(first, "purchase"), (second, "purchase")],
    )
    result = get_summary(database.connection, month="2026-01")
    assert result.expenses == 0
    assert result.untranslated == ["EUR"]


