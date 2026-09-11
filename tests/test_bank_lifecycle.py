import json
from dataclasses import replace
from datetime import date
from decimal import Decimal

import pytest

from expense_tracker.importers import _parse_amount, import_nest_csv
from expense_tracker.ledger import approve_merchant_suggestion_with_category, save_decision, transactions
from expense_tracker.models import Transaction
from expense_tracker.recovery import backup_database, record_undo, undo_last
from expense_tracker.summary_service import get_summary


def operation(state="PENDING", amount="-40", timestamp="2026-09-01 10:00:00"):
    return Transaction(
        account="revolut",
        booking_date=date(2026, 9, 1),
        amount=Decimal(amount),
        currency="PLN",
        description="Shop",
        raw={"State": state, "Started Date": timestamp, "Product": "Current", "Type": "Card Payment"},
    )


@pytest.mark.parametrize(
    ("text", "expected"), [("1,234.56", "1234.56"), ("1.234,56", "1234.56"), ("1 234,56", "1234.56")]
)
def test_number_formats(text, expected):
    assert _parse_amount(text) == Decimal(expected)


@pytest.mark.parametrize("text", ["NaN", "Infinity", "-Infinity"])
def test_nonfinite_rejected(text):
    with pytest.raises(ValueError):
        _parse_amount(text)


def test_settlement_preserves_classification_and_reimport_cannot_regress(database):
    tid = database.insert_transaction(operation())
    save_decision(database.connection, tid, "groceries")
    database.insert_transaction(operation("COMPLETED", "-41"))
    database.insert_transaction(operation())
    [row] = transactions(database.connection)
    assert (row["id"], row["amount"], row["category_key"], row["bank_status"]) == (tid, "-41", "groceries", "COMPLETED")
    database.insert_transaction(operation("REVERTED", "-41"))
    assert not transactions(database.connection)
    database.insert_transaction(operation("COMPLETED", "-41"))
    assert not transactions(database.connection)


def test_same_day_same_amount_distinct_timestamps(database):
    database.insert_transaction(operation(timestamp="2026-09-01 10:00:00"))
    database.insert_transaction(operation(timestamp="2026-09-01 11:00:00"))
    assert len(transactions(database.connection)) == 2


def test_stale_suggestion_cannot_overwrite_manual(database):
    tid = database.insert_transaction(operation())
    payload = json.dumps({"transaction_ids": [tid]})
    sid = database.connection.execute(
        "INSERT INTO suggestions(fingerprint,kind,payload_json,confidence,source,status) "
        "VALUES('test','merchant_classification',?,.5,'llm','suggested')",
        (payload,),
    ).lastrowid
    database.connection.commit()
    save_decision(database.connection, tid, "groceries")
    with pytest.raises(ValueError, match="zmieniły"):
        approve_merchant_suggestion_with_category(database.connection, sid, "shopping", False)
    assert transactions(database.connection)[0]["category_key"] == "groceries"


def test_nest_operation_without_booking_date(tmp_path):
    path = tmp_path / "nest.csv"
    path.write_text("Data księgowania;Data operacji;Kwota;Waluta;Opis\n;09-09-2026;-10,00;PLN;Kawa\n")
    [row] = import_nest_csv(path)
    assert row.booking_date == date(2026, 9, 9)


def test_daily_running_balance_with_gaps(database):
    database.insert_transactions(
        [operation("COMPLETED", "-40"), replace(operation("COMPLETED", "100"), booking_date=date(2026, 9, 3), raw={})]
    )
    result = get_summary(database.connection, mode="custom", start=date(2026, 9, 1), end=date(2026, 9, 4))
    assert [p.balance for p in result.daily] == [Decimal(-40), Decimal(-40), Decimal(60), Decimal(60)]
    assert result.daily[-1].balance == result.balance


def test_undo_restores_and_refuses_external_changes(tmp_path):
    from expense_tracker.database import Database

    path = tmp_path / "db.sqlite3"
    db = Database(path)
    tid = db.insert_transaction(operation())
    backup = backup_database(path, "action")
    save_decision(db.connection, tid, "groceries")
    record_undo(path, backup)
    undo_last(path)
    assert transactions(db.connection)[0]["category_key"] is None
    backup = backup_database(path, "action")
    save_decision(db.connection, tid, "groceries")
    record_undo(path, backup)
    save_decision(db.connection, tid, "shopping")
    with pytest.raises(ValueError, match="poza aplikacją"):
        undo_last(path)
    assert transactions(db.connection)[0]["category_key"] == "shopping"
    db.close()


def test_monthly_chart_has_twelve_buckets_and_excludes_own_transfers(database):
    today = date.today()
    previous_month = date(today.year - (today.month == 1), (today.month - 2) % 12 + 1, 1)
    current = replace(operation("COMPLETED", "100"), booking_date=today, raw={})
    previous = replace(operation("COMPLETED", "-20"), booking_date=previous_month, raw={})
    transfer = replace(operation("COMPLETED", "-300"), booking_date=today, description="Own transfer", raw={})
    database.insert_transactions([current, previous])
    tid = database.insert_transaction(transfer)
    save_decision(database.connection, tid, "transfer_own")
    result = get_summary(database.connection)
    assert len(result.monthly) == 12
    assert result.monthly[-1].change == Decimal(100)
    assert result.monthly[-2].change == Decimal(-20)
    assert len(result.daily) == today.day
