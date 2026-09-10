from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from .text_utils import clean_description, is_card_operation


def _visible_counterparty(row: dict[str, object]) -> str:
    # For a card payment, "counterparty" is the card acquirer/bank, not the merchant (which is
    # already in the description) — showing it is noise. For a transfer, it's the actual person
    # or company the money moved to/from, which is genuinely useful (e.g. spotting a rent payment).
    # Nest formats it as "NAME|ADDRESS" — only the name is worth showing.
    if is_card_operation(row.get("transaction_type")):
        return "—"
    counterparty = row["counterparty"]
    if not counterparty:
        return "—"
    return str(counterparty).split("|")[0].strip() or "—"


def _standalone_row(row: dict[str, object]) -> dict[str, object]:
    amount = Decimal(str(row["amount"]))
    real = Decimal(0) if row["category_key"] == "transfer_own" else amount
    return {
        "id": row["id"],
        "_kind": "standalone",
        "Data": row["booking_date"],
        "Konto": row["account"],
        "Opis": clean_description(str(row["description"])),
        "Kontrahent": _visible_counterparty(row),
        "Kwota": float(amount),
        "Waluta": row["currency"],
        "Kategoria": row["category_label"] or "Do przypisania",
        "Sprawa": "—",
        "Kwota rzeczywista": float(real),
    }


def _member_row(row: dict[str, object], case: dict[str, object]) -> dict[str, object]:
    return {
        "id": row["id"],
        "_kind": "case_member",
        "Data": row["booking_date"],
        "Konto": row["account"],
        "Opis": f"↳ {clean_description(str(row['description']))}",
        "Kontrahent": _visible_counterparty(row),
        "Kwota": float(Decimal(str(row["amount"]))),
        "Waluta": row["currency"],
        "Kategoria": case["category_label"] or "Do przypisania",
        "Sprawa": case["title"],
        "Kwota rzeczywista": None,
    }


def _summary_row(case: dict[str, object]) -> dict[str, object]:
    personal_amount = Decimal(str(case["personal_amount"]))
    return {
        "id": None,
        "_kind": "case_summary",
        "Data": case["booking_date"],
        "Konto": "—",
        "Opis": f"🔗 {case['title']}",
        "Kontrahent": "—",
        "Kwota": None,
        "Waluta": case["currency"],
        "Kategoria": case["category_label"] or "Do przypisania",
        "Sprawa": case["title"],
        "Kwota rzeczywista": float(-personal_amount),
    }


def build_rows(transactions: list[dict[str, object]], cases: list[dict[str, object]]) -> list[dict[str, object]]:
    """Shape the ledger into one row per transaction. Approved-case members are grouped
    adjacently right after a synthetic header/summary row (so the group reads top-down like a
    header with its line items) while raw movements stay fully visible for audit; only the
    case's real personal cost feeds category totals (matches reporting.actuals())."""
    cases_by_id = {int(case["id"]): case for case in cases}
    members_by_case: defaultdict[int, list[dict[str, object]]] = defaultdict(list)
    standalone: list[dict[str, object]] = []
    for row in transactions:
        case_id = row["case_id"]
        if case_id is not None and int(case_id) in cases_by_id:
            members_by_case[int(case_id)].append(row)
        else:
            standalone.append(row)

    blocks: list[tuple[str, list[dict[str, object]]]] = []
    for row in standalone:
        blocks.append((str(row["booking_date"]), [_standalone_row(row)]))
    for case_id, members in members_by_case.items():
        case = cases_by_id[case_id]
        ordered_members = sorted(members, key=lambda member: str(member["booking_date"]))
        block_rows = [_summary_row(case), *(_member_row(member, case) for member in ordered_members)]
        blocks.append((str(case["booking_date"]), block_rows))

    blocks.sort(key=lambda block: block[0], reverse=True)
    return [row for _, block_rows in blocks for row in block_rows]
