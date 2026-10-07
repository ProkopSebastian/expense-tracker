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


def test_sale_uses_historical_cost_and_reprices_after_earlier_funding(database):
    from expense_tracker.ledger import approved_cases

    wallet_id = open_wallet(database)
    wallets.set_opening_balance(
        database.connection, wallet_id=wallet_id, amount=Decimal(100), pln_cost=Decimal(600),
        booking_date=date(2026, 3, 1),
    )
    proceeds = add(database, "450", currency="PLN", day="2026-02-01")
    wallets.sell_wallet(
        database.connection, wallet_id=wallet_id, proceeds_transaction_id=proceeds, given_amount=Decimal(100),
    )
    assert Decimal(approved_cases(database.connection)[0]["personal_amount"]) == -50
    wallets.set_opening_balance(
        database.connection, wallet_id=wallet_id, amount=Decimal(100), pln_cost=Decimal(600),
        booking_date=date(2026, 1, 15),
    )
    assert Decimal(approved_cases(database.connection)[0]["personal_amount"]) == 50


def test_backdated_manual_spend_cannot_use_future_funding(database):
    import pytest

    from expense_tracker.web_models import ManualEntry
    from expense_tracker.web_service import add_manual

    wallet_id = open_wallet(database, day="2026-03-01")
    with pytest.raises(ValueError, match="Portfel ma 0"):
        add_manual(database.connection, ManualEntry(
            account="test", wallet_id=wallet_id, booking_date=date(2026, 1, 1), amount=Decimal(-20),
            currency="EUR", description="Test", category_key="groceries",
        ))


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


def test_foreign_source_without_a_cost_does_not_invent_zlotys(database):
    wallet_id = wallets.create_wallet(database.connection, "cash", "USD")
    source = add(database, "-100", currency="EUR")
    wallets.fund_wallet(
        database.connection, wallet_id=wallet_id, source_transaction_id=source, received_amount=Decimal(110),
    )
    [wallet] = wallets.list_wallets(database.connection)
    assert wallet["balance"] == "110.00"
    assert wallet["average_cost"] is None
    assert wallet["pln_value"] is None


def test_explicit_zero_cost_is_distinct_from_missing_cost(database):
    from expense_tracker.summary_service import get_summary

    open_wallet(database, cost="0")
    add(database, "-20")
    result = get_summary(database.connection, month="2026-01")
    assert result.untranslated == []
    assert result.item_count == 1
    assert result.expenses == 0


def test_later_funding_does_not_spread_its_cost_over_an_earlier_deficit(database):
    wallet_id = wallets.create_wallet(database.connection, "test", "EUR")
    add(database, "-20")
    wallets.set_opening_balance(
        database.connection, wallet_id=wallet_id, amount=Decimal(100), pln_cost=Decimal(400),
        booking_date=date(2026, 3, 1),
    )
    [wallet] = wallets.list_wallets(database.connection)
    assert wallet["average_cost"] == "4.000000"
    assert wallet["pln_value"] == "320.00"


def test_sale_rejects_foreign_proceeds_without_changing_the_wallet(database):
    import pytest

    wallet_id = open_wallet(database)
    proceeds = add(database, "100", currency="USD")
    with pytest.raises(ValueError, match="wpływu w PLN"):
        wallets.sell_wallet(
            database.connection, wallet_id=wallet_id, proceeds_transaction_id=proceeds, given_amount=Decimal(10),
        )
    assert wallets.wallet_balance(database.connection, wallet_id) == 100
    assert database.connection.execute("SELECT COUNT(*) FROM cases").fetchone()[0] == 0


def test_group_cost_uses_only_historical_rates_of_its_expenses(database):
    from expense_tracker.ledger import create_case
    from expense_tracker.summary_service import get_summary

    wallet_id = open_wallet(database)
    first = add(database, "-20")
    second = add(database, "-20", day="2026-01-03")
    create_case(
        database.connection, "shared_purchase", "Test group", "groceries", Decimal(40), "EUR",
        [(first, "purchase"), (second, "purchase")],
    )
    assert get_summary(database.connection, month="2026-01").expenses == 160
    wallets.set_opening_balance(
        database.connection, wallet_id=wallet_id, amount=Decimal(100), pln_cost=Decimal(600),
        booking_date=date(2026, 3, 1),
    )
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


def test_unknown_sale_cost_is_visible_even_without_a_source_wallet(database):
    from expense_tracker.ledger import approved_cases
    from expense_tracker.summary_service import get_summary

    target_wallet = wallets.create_wallet(database.connection, "cash", "PLN")
    source = add(database, "-100", currency="EUR")
    wallets.fund_wallet(
        database.connection, wallet_id=target_wallet, source_transaction_id=source, received_amount=Decimal(450),
    )
    [case] = approved_cases(database.connection)
    assert case["valuation_missing"] == "EUR"
    for currency in ("ALL", "PLN"):
        result = get_summary(database.connection, currency=currency, month="2026-01")
        assert result.untranslated == ["EUR"]
        assert result.income == 0


def test_automatic_sale_matching_never_joins_different_accounts(database):
    import pytest

    wallet_id = open_wallet(database, amount="200", cost="800")
    raw = {"Type": "Exchange", "Started Date": "2026-01-02 10:00:00"}
    outflow = add(database, "-100", raw=raw)
    proceeds = add(database, "450", currency="PLN", account="other", raw=raw)
    with pytest.raises(ValueError, match="różnymi rachunkami"):
        wallets.sell_wallet(
            database.connection, wallet_id=wallet_id, proceeds_transaction_id=proceeds, given_amount=Decimal(100),
        )
    wallets.sell_wallet(
        database.connection, wallet_id=wallet_id, proceeds_transaction_id=proceeds,
        given_amount=Decimal(100), source_transaction_id=outflow,
    )
    assert wallets.wallet_balance(database.connection, wallet_id) == 100
