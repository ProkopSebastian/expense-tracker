# Invented data for screenshots and the README recording, kept apart from any real database.
#   uv run python scripts/demo_data.py
#   uv run uvicorn --factory scripts.demo_data:demo_app --port 8001

import csv
import io
import random
import shutil
from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from expense_tracker.api import create_app
from expense_tracker.database import Database
from expense_tracker.llm.service import _save_suggestion

OUTPUT = Path("demo")
DATABASE = OUTPUT / "demo.sqlite3"
FIRST_DAY = date(2026, 7, 1)
MONTHS = 3

# merchant, category, typical amount, visits per month
REGULARS = [
    ("Żabka", "groceries", 18, 8),
    ("Biedronka", "groceries", 95, 4),
    ("Lidl", "groceries", 120, 2),
    ("Kawiarnia Ziarno", "food_coffee", 16, 5),
    ("Bolt Food", "food_delivery", 58, 2),
    ("Netflix", "subscriptions", 49, 1),
    ("Spotify", "subscriptions", 23.99, 1),
    ("ZTM Warszawa", "transport_public", 3.40, 10),
    ("Uber", "transport_taxi", 27, 2),
    ("Apteka Słoneczna", "health_pharmacy", 34, 1),
    ("Kino Muranów", "entertainment_cinema", 32, 1),
]
# Left without a decision so "Do klasyfikacji" has work: some get an AI suggestion, some none.
UNSORTED = [
    ("Piekarnia Pod Lipami", 14, "groceries", 0.96),
    ("Rossmann", 42, "health_pharmacy", 0.93),
    ("Decathlon", 189, "shopping_clothes", 0.91),
    ("Kwiaciarnia Róża", 65, None, None),
    ("Sklep Gamma", 37, None, None),
]

WEALTH_ASSETS = [
    ("Konto osobiste", "account", "PLN", "Nest Bank"),
    ("Konto oszczędnościowe", "savings", "PLN", "Nest Bank"),
    ("Lokata 6M", "savings", "PLN", "Bank Pekao"),
    ("Obligacje skarbowe", "bonds", "PLN", "PKO BP"),
    ("Revolut EUR", "account", "EUR", "Revolut"),
    ("ETF na świat", "investments", "PLN", "XTB"),
    ("Złoto", "gold", "PLN", None),
    ("Pożyczka dla brata", "debt", "PLN", None),
]
# Uneven on purpose: three entries in one month, then months apart. The bonds are redeemed into
# the savings account in May, the ETF only starts in June and the deposit ends in June.
WEALTH_SNAPSHOTS = [
    ("2025-10-31", "4.2650", {"Konto osobiste": "8200", "Konto oszczędnościowe": "31000", "Lokata 6M": "20000",
                              "Obligacje skarbowe": "40000", "Revolut EUR": "900", "Złoto": "9500"}),
    ("2025-11-08", "4.2480", {"Konto osobiste": "6900", "Konto oszczędnościowe": "32000", "Lokata 6M": "20000",
                              "Obligacje skarbowe": "40100", "Revolut EUR": "900", "Złoto": "9650"}),
    ("2025-11-19", "4.2310", {"Konto osobiste": "5400", "Konto oszczędnościowe": "33500", "Lokata 6M": "20000",
                              "Obligacje skarbowe": "40200", "Revolut EUR": "850", "Złoto": "9600"}),
    ("2025-11-28", "4.2200", {"Konto osobiste": "9800", "Konto oszczędnościowe": "33500", "Lokata 6M": "20000",
                              "Obligacje skarbowe": "40300", "Revolut EUR": "850", "Złoto": "9800",
                              "Pożyczka dla brata": "-3000"}),
    ("2026-02-27", "4.2150", {"Konto osobiste": "7600", "Konto oszczędnościowe": "38000", "Lokata 6M": "20400",
                              "Obligacje skarbowe": "41000", "Revolut EUR": "1200", "Złoto": "10400",
                              "Pożyczka dla brata": "-2000"}),
    ("2026-05-29", "4.2600", {"Konto osobiste": "8100", "Konto oszczędnościowe": "84500", "Lokata 6M": "20400",
                              "Obligacje skarbowe": "0", "Revolut EUR": "1100", "Złoto": "11200",
                              "Pożyczka dla brata": "-1000"}),
    ("2026-06-30", "4.2450", {"Konto osobiste": "7300", "Konto oszczędnościowe": "75000", "Lokata 6M": "0",
                              "Obligacje skarbowe": "0", "Revolut EUR": "1000", "ETF na świat": "30000",
                              "Złoto": "11000", "Pożyczka dla brata": "0"}),
    ("2026-09-30", "4.2700", {"Konto osobiste": "9100", "Konto oszczędnościowe": "56000", "Obligacje skarbowe": "0",
                              "Revolut EUR": "1500", "ETF na świat": "52500", "Złoto": "12100",
                              "Pożyczka dla brata": "0"}),
]

ROWS: list[dict[str, str]] = []


def row(day: date, description: str, amount: float, currency: str = "PLN", kind: str = "Card Payment", second=0):
    stamp = f"{day.isoformat()} 12:{len(ROWS) % 60:02d}:{second:02d}"
    ROWS.append(
        {
            "Type": kind,
            "Product": "Current",
            "Started Date": stamp,
            "Completed Date": stamp,
            "Description": description,
            "Amount": f"{amount:.2f}",
            "Fee": "0.00",
            "Currency": currency,
            "State": "COMPLETED",
            "Balance": "",
        }
    )


def statement() -> bytes:
    rng = random.Random(7)
    for month in range(MONTHS):
        start = date(FIRST_DAY.year, FIRST_DAY.month + month, 1)
        row(start + timedelta(days=9), "Wynagrodzenie — Studio Kreska", 7200, kind="Transfer")
        row(start + timedelta(days=1), "Czynsz — Wspólnota Mieszkaniowa", -2100, kind="Transfer")
        for merchant, _, amount, visits in REGULARS:
            for _ in range(visits):
                day = start + timedelta(days=rng.randrange(0, 28))
                row(day, merchant, -round(amount * rng.uniform(0.7, 1.3), 2))
    for merchant, amount, _, _ in UNSORTED:
        row(date(2026, 9, rng.randrange(2, 28)), merchant, -amount)
    # A weekend in Lisbon: złoty exchanged into euro, both halves share one start time.
    exchange_day = date(2026, 8, 14)
    row(exchange_day, "Wymiana na EUR", -860, kind="Exchange", second=1)
    ROWS[-1]["Started Date"] = ROWS[-1]["Completed Date"] = "2026-08-14 09:15:00"
    row(exchange_day, "Wymiana z PLN", 200, currency="EUR", kind="Exchange")
    ROWS[-1]["Started Date"] = ROWS[-1]["Completed Date"] = "2026-08-14 09:15:00"
    for offset, merchant, amount in [
        (1, "Pastéis de Belém", 12.4),
        (1, "Metro Lisboa", 6.6),
        (2, "Time Out Market", 34.5),
        (2, "Museu Nacional do Azulejo", 10),
        (3, "Tasca do Chico", 48),
    ]:
        row(exchange_day + timedelta(days=offset), merchant, -amount, currency="EUR")
    # A shared dinner, half of it paid back over BLIK.
    row(date(2026, 9, 12), "Restauracja Zielona Weranda", -240)
    row(date(2026, 9, 13), "BLIK od Katarzyny Nowak", 120, kind="Transfer")
    # Cash for the market; what it bought is never on the statement.
    row(date(2026, 9, 5), "Bankomat Euronet", -200, kind="Cash Withdrawal")
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(ROWS[0]))
    writer.writeheader()
    writer.writerows(sorted(ROWS, key=lambda r: r["Started Date"]))
    return buffer.getvalue().encode()


def demo_app():
    return create_app(database_path=DATABASE, configuration_dir=OUTPUT)


def main() -> None:
    shutil.rmtree(OUTPUT, ignore_errors=True)
    OUTPUT.mkdir(parents=True)
    with TestClient(demo_app()) as client:
        def call(method: str, path: str, **kwargs):
            response = client.request(method, f"/api{path}", **kwargs)
            response.raise_for_status()
            return response.json()

        call("POST", "/import", content=statement(), headers={"X-File-Name": "revolut.csv"})
        ledger = call("GET", "/ledger")
        pages = ledger["pages"]
        blocks = [b for page in range(1, pages + 1) for b in call("GET", f"/ledger?page={page}")["blocks"]]
        by_description = {}
        for block in blocks:
            by_description.setdefault(block["description"], []).append(block)

        categories = {merchant: category for merchant, category, _, _ in REGULARS}
        categories |= {
            "Wynagrodzenie — Studio Kreska": "income_salary",
            "Czynsz — Wspólnota Mieszkaniowa": "housing_rent",
            "Pastéis de Belém": "food_coffee",
            "Metro Lisboa": "travel",
            "Time Out Market": "travel",
            "Museu Nacional do Azulejo": "travel",
            "Tasca do Chico": "travel",
            "Bankomat Euronet": "cash_withdrawal",
        }
        for description, category in categories.items():
            first, *rest = by_description[description]
            # Remembering the first one turns the rest into rule matches, as in real use.
            call("PUT", f"/transactions/{first['id']}/category", json={"category_key": category, "remember": True})

        dinner = by_description["Restauracja Zielona Weranda"][0]
        payback = by_description["BLIK od Katarzyny Nowak"][0]
        call(
            "POST",
            "/cases",
            json={
                "title": "Kolacja z Kasią",
                "kind": "shared_purchase",
                "personal_amount": "120.00",
                "currency": "PLN",
                "category_key": "food",
                "members": [
                    {"transaction_id": dinner["id"], "role": "purchase"},
                    {"transaction_id": payback["id"], "role": "received_reimbursement"},
                ],
            },
        )

        cash = call("POST", "/wallets", json={"account": "Gotówka", "currency": "PLN"})["id"]
        atm = by_description["Bankomat Euronet"][0]
        call("POST", f"/wallets/{cash}/fund", json={"source_transaction_id": atm["id"], "received_amount": "200.00"})

        assets = {}
        for name, kind, currency, institution in WEALTH_ASSETS:
            assets[name] = call(
                "POST",
                "/wealth/assets",
                json={"name": name, "kind": kind, "currency": currency, "institution": institution},
            )["id"]
        for day, euro_rate, balances in WEALTH_SNAPSHOTS:
            call(
                "POST",
                "/wealth/snapshots",
                json={
                    "day": day,
                    "balances": [{"asset_id": assets[name], "amount": amount} for name, amount in balances.items()],
                    "rates": {"EUR": euro_rate},
                },
            )
        call(
            "PUT",
            f"/wealth/assets/{assets['Lokata 6M']}",
            json={"name": "Lokata 6M", "kind": "savings", "institution": "Bank Pekao", "is_active": False},
        )

    database = Database(DATABASE)
    with database.connection as connection:
        for merchant, _, category, confidence in UNSORTED:
            if category is None:
                continue
            ids = [b["id"] for b in by_description[merchant]]
            _save_suggestion(
                connection,
                "merchant_classification",
                {
                    "category_key": category,
                    "confidence": confidence,
                    "rationale": f"„{merchant}” to sieć, której sklepy sprzedają głównie produkty z tej kategorii.",
                    "should_create_rule": True,
                    "transaction_ids": ids,
                },
            )
    database.close()
    print(f"Demo database ready: {DATABASE}")


if __name__ == "__main__":
    main()
