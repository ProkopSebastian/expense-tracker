from datetime import date
from decimal import Decimal

from expense_tracker import cash_service, ledger
from expense_tracker.summary_service import get_summary


def withdraw(database, day, pln, eur):
    transaction_id = ledger.add_manual_transaction(
        database.connection, account="Bank", booking_date=day, amount=Decimal(f"-{pln}"), currency="PLN",
        description="Bankomat", counterparty=None, category_key="cash_withdrawal",
    )
    cash_service.set_withdrawal_currency(database.connection, transaction_id, "EUR", Decimal(eur))


def spend_cash(database, day, eur):
    return ledger.add_manual_transaction(
        database.connection, account=cash_service.CASH_ACCOUNT, booking_date=day, amount=Decimal(f"-{eur}"),
        currency="EUR", description="Taxi", counterparty=None, category_key="transport_taxi",
    )


def test_cash_spent_beyond_the_pot_is_not_priced_at_an_earlier_rate(database):
    withdraw(database, date(2026, 1, 1), "430", "100")
    cash_service.save_count(
        database.connection, currency="EUR", counted_on=date(2026, 1, 5), amount=Decimal(0), start_cost=None, lines=[],
    )
    taxi = spend_cash(database, date(2026, 3, 1), "50")
    withdraw(database, date(2026, 3, 2), "900", "200")

    state = cash_service.cash_state(database.connection)
    assert taxi not in state.values
    assert state.partial[taxi] is None
    summary = get_summary(database.connection, month="2026-03")
    assert summary.expenses == 0
    assert summary.untranslated == ["EUR"]


def test_cash_brought_in_on_a_day_covers_that_days_spending(database):
    taxi = spend_cash(database, date(2026, 3, 1), "50")
    withdraw(database, date(2026, 3, 1), "450", "100")

    assert cash_service.cash_state(database.connection).values[taxi] == Decimal("-225.00")
