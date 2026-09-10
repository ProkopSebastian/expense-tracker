from __future__ import annotations

import sqlite3
from decimal import Decimal

import pandas as pd
import streamlit as st

from ..config import settings
from ..ledger import (
    apply_rules,
    approve_merchant_suggestion_with_category,
    reject_suggestion,
    save_decision,
    save_merchant_rule,
)
from ..llm.service import analyze_merchants, analyze_relations
from ..text_utils import clean_description
from .formatting import category_options

UNASSIGNED = "Do przypisania"


def _ai_buttons(connection: sqlite3.Connection, data: dict[str, object]) -> None:
    if not settings.openai_api_key:
        st.info("Funkcje AI są wyłączone — brakuje klucza w pliku `.env`. Dodaj go i uruchom aplikację ponownie.")
        return
    unclassified = [row for row in data["transactions"] if not row["category_key"] and not row["case_id"]]
    merchant_suggestions = [s for s in data["suggestions"] if s["kind"] == "merchant_classification"]
    metric_col1, metric_col2 = st.columns(2)
    metric_col1.metric("Niesklasyfikowane transakcje", len(unclassified))
    metric_col2.metric("Sugestie do przejrzenia", len(merchant_suggestions))
    st.caption(
        "AI sprawdza za jednym razem maksymalnie 20 różnych sprzedawców. Jeśli zostanie ich więcej, "
        "kliknij przycisk ponownie, żeby przetworzyć kolejną partię."
    )
    button_col1, button_col2 = st.columns(2)
    if button_col1.button("Klasyfikuj merchantów przez AI", type="primary", disabled=not unclassified):
        with st.spinner("AI klasyfikuje kolejną partię merchantów i w razie potrzeby sprawdza ich w internecie..."):
            try:
                result = analyze_merchants(connection)
            except Exception as error:
                st.error(f"Nie udało się uzyskać sugestii AI: {error}")
                return
        if result.groups_remaining:
            st.success(
                f"Sprawdzono {result.groups_processed} sprzedawców (nowe sugestie: {result.saved}). "
                f"Zostało jeszcze {result.groups_remaining} — kliknij ponownie, żeby przetworzyć kolejną partię."
            )
        else:
            st.success(f"Sprawdzono wszystkich {result.groups_processed} sprzedawców, nowe sugestie: {result.saved}.")
        st.rerun()
    if button_col2.button("Wykryj powiązania między transakcjami"):
        with st.spinner("AI analizuje transakcje i szuka wspólnych spraw..."):
            try:
                count = analyze_relations(connection)
            except Exception as error:
                st.error(f"Nie udało się uzyskać sugestii AI: {error}")
                return
        st.success(f"Dodano sugestie: {count}.")
        st.rerun()


def _build_editor_rows(data: dict[str, object], label_by_key: dict[str, str]) -> list[dict[str, object]]:
    transactions_by_id = {int(row["id"]): row for row in data["transactions"]}
    suggestions = [s for s in data["suggestions"] if s["kind"] == "merchant_classification"]
    covered_ids = {int(tid) for s in suggestions for tid in s["payload"]["transaction_ids"]}

    rows: list[dict[str, object]] = []
    for suggestion in suggestions:
        payload = suggestion["payload"]
        transaction_ids = [int(tid) for tid in payload["transaction_ids"]]
        sample = transactions_by_id.get(transaction_ids[0])
        opis = clean_description(str(sample["description"])) if sample else "—"
        if len(transaction_ids) > 1:
            opis = f"{len(transaction_ids)}× {opis}"
        # An AI guess of "uncategorized" is not a real answer — don't pre-fill it as if it were
        # a confident choice, or clicking "Zapisz zmiany" without touching anything silently
        # writes a decision the user never actually made.
        suggested_key = str(payload["category_key"])
        default_category = (
            UNASSIGNED if suggested_key == "uncategorized_expense" else label_by_key.get(suggested_key, UNASSIGNED)
        )
        rows.append(
            {
                "suggestion_id": suggestion["id"],
                "transaction_id": None,
                "Data": sample["booking_date"] if sample else "—",
                "Opis": opis,
                "Kwota": f"{Decimal(str(sample['amount'])):.2f} {sample['currency']}" if sample else "—",
                "Sugestia AI": payload.get("rationale", "—"),
                "Pewność": f"{payload.get('confidence', 0):.0%}",
                "Kategoria": default_category,
                "Zapamiętaj regułę": bool(payload.get("should_create_rule", False)),
                "Odrzuć": False,
            }
        )
    for row in data["transactions"]:
        transaction_id = int(row["id"])
        if row["category_key"] or row["case_id"] or transaction_id in covered_ids:
            continue
        rows.append(
            {
                "suggestion_id": None,
                "transaction_id": transaction_id,
                "Data": row["booking_date"],
                "Opis": clean_description(str(row["description"])),
                "Kwota": f"{Decimal(str(row['amount'])):.2f} {row['currency']}",
                "Sugestia AI": "—",
                "Pewność": "—",
                "Kategoria": UNASSIGNED,
                "Zapamiętaj regułę": False,
                "Odrzuć": False,
            }
        )
    return rows


def _classification_editor(connection: sqlite3.Connection, data: dict[str, object]) -> None:
    options = category_options(data["categories"])
    label_by_key = {key: label for label, key in options.items()}
    rows = _build_editor_rows(data, label_by_key)
    if not rows:
        st.success("Brak transakcji oczekujących na klasyfikację.")
        return

    st.caption(
        "Ustaw kategorię i kliknij „Zapisz zmiany”. Zapisany zostanie każdy wiersz, który ma wybraną "
        "kategorię inną niż „Do przypisania” — łącznie z niezmienionymi sugestiami AI."
    )
    df = pd.DataFrame(rows)
    edited = st.data_editor(
        df,
        column_order=["Data", "Opis", "Kwota", "Sugestia AI", "Pewność", "Kategoria", "Zapamiętaj regułę", "Odrzuć"],
        column_config={
            "Data": st.column_config.TextColumn(disabled=True),
            "Opis": st.column_config.TextColumn(disabled=True, width="medium"),
            "Kwota": st.column_config.TextColumn(disabled=True),
            "Sugestia AI": st.column_config.TextColumn(
                disabled=True, width="large", help="Uzasadnienie podane przez AI (puste dla ręcznie dodanych wierszy)."
            ),
            "Pewność": st.column_config.TextColumn(disabled=True, help="Jak bardzo AI jest pewne swojej sugestii."),
            "Kategoria": st.column_config.SelectboxColumn(
                options=[UNASSIGNED, *options.keys()],
                help="Kategoria, która zostanie zapisana po kliknięciu „Zapisz zmiany”. "
                "„Do przypisania” = ten wiersz zostanie pominięty.",
            ),
            "Zapamiętaj regułę": st.column_config.CheckboxColumn(
                help="Zaznacz, żeby przyszłe transakcje o tym samym opisie dostawały tę kategorię "
                "automatycznie, bez pytania AI ponownie."
            ),
            "Odrzuć": st.column_config.CheckboxColumn(
                help="Odrzuć sugestię AI bez zapisywania dla niej żadnej kategorii."
            ),
        },
        hide_index=True,
        key="classification_editor",
    )
    if st.button("Zapisz zmiany", type="primary"):
        any_rule_created = False
        saved_count = 0
        rejected_count = 0
        for _, row in edited.iterrows():
            suggestion_id = None if pd.isna(row["suggestion_id"]) else int(row["suggestion_id"])
            transaction_id = None if pd.isna(row["transaction_id"]) else int(row["transaction_id"])
            if row["Odrzuć"]:
                if suggestion_id is not None:
                    reject_suggestion(connection, suggestion_id)
                    rejected_count += 1
                continue
            if row["Kategoria"] == UNASSIGNED:
                continue
            category_key = options[row["Kategoria"]]
            should_create_rule = bool(row["Zapamiętaj regułę"])
            if suggestion_id is not None:
                approve_merchant_suggestion_with_category(connection, suggestion_id, category_key, should_create_rule)
            elif transaction_id is not None:
                save_decision(connection, transaction_id, category_key)
                if should_create_rule:
                    save_merchant_rule(connection, transaction_id, category_key)
                    any_rule_created = True
            saved_count += 1
        if any_rule_created:
            apply_rules(connection)
        st.success(f"Zapisano {saved_count} kategorii, odrzucono {rejected_count} sugestii.")
        st.rerun()


def render(connection: sqlite3.Connection, data: dict[str, object]) -> None:
    _ai_buttons(connection, data)
    st.divider()
    _classification_editor(connection, data)
