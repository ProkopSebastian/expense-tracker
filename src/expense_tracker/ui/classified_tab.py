from __future__ import annotations

import sqlite3

import pandas as pd
import streamlit as st

from ..ledger import delete_merchant_rule, merchant_rules, save_decision
from .formatting import category_options

SOURCE_LABELS = {"manual": "Ręcznie", "rule": "Reguła", "llm": "AI"}


def _decided_editor(connection: sqlite3.Connection, data: dict[str, object]) -> None:
    options = category_options(data["categories"])
    label_by_key = {key: label for label, key in options.items()}
    decided = {int(row["id"]): row for row in data["transactions"] if row["category_key"] and not row["case_id"]}
    if not decided:
        st.info("Brak jeszcze sklasyfikowanych transakcji.")
        return

    rows = [
        {
            "transaction_id": transaction_id,
            "Data": row["booking_date"],
            "Opis": row["description"],
            "Kwota": f"{row['amount']} {row['currency']}",
            "Kategoria": label_by_key.get(row["category_key"], "Do przypisania"),
            "Źródło": SOURCE_LABELS.get(row["decision_source"], "—"),
        }
        for transaction_id, row in decided.items()
    ]
    df = pd.DataFrame(rows)
    edited = st.data_editor(
        df,
        column_order=["Data", "Opis", "Kwota", "Kategoria", "Źródło"],
        column_config={
            "Data": st.column_config.TextColumn(disabled=True),
            "Opis": st.column_config.TextColumn(disabled=True, width="large"),
            "Kwota": st.column_config.TextColumn(disabled=True),
            "Kategoria": st.column_config.SelectboxColumn(options=list(options)),
            "Źródło": st.column_config.TextColumn(disabled=True),
        },
        hide_index=True,
        key="decided_editor",
    )
    if st.button("Zapisz poprawki", type="primary"):
        changed = 0
        for _, row in edited.iterrows():
            transaction_id = int(row["transaction_id"])
            new_key = options[row["Kategoria"]]
            if new_key != decided[transaction_id]["category_key"]:
                save_decision(connection, transaction_id, new_key, "Poprawione ręcznie")
                changed += 1
        if changed:
            st.success(f"Zaktualizowano {changed} transakcji.")
            st.rerun()
        else:
            st.info("Brak zmian do zapisania.")


def _rules_manager(connection: sqlite3.Connection) -> None:
    st.subheader("Zapamiętane reguły sprzedawców")
    rules = merchant_rules(connection)
    if not rules:
        st.caption("Nie masz jeszcze reguł — powstają po zatwierdzeniu kategorii z opcją „zapamiętaj regułę”.")
        return
    for rule in rules:
        merchant_col, category_col, action_col = st.columns([3, 2, 1])
        merchant_col.write(str(rule["merchant_key"]).title())
        category_col.write(rule["category_label"])
        if action_col.button("Usuń regułę", key=f"delete_rule_{rule['id']}"):
            delete_merchant_rule(connection, int(rule["id"]))
            st.rerun()


def render(connection: sqlite3.Connection, data: dict[str, object]) -> None:
    st.caption("Popraw kategorię, jeśli AI albo reguła coś źle sklasyfikowały — zmiana zapisuje się od razu.")
    _decided_editor(connection, data)
    st.divider()
    _rules_manager(connection)
