from __future__ import annotations

import sqlite3

import pandas as pd
import streamlit as st

from ..ledger import delete_merchant_rule, merchant_rules, update_merchant_rule
from .formatting import category_options


def render(connection: sqlite3.Connection, data: dict[str, object]) -> None:
    st.subheader("Zapamiętane reguły sprzedawców")
    st.caption(
        "Raz zapisana reguła klasyfikuje automatycznie każdą przyszłą transakcję tego samego sprzedawcy, bez "
        "pytania AI ponownie. Zmiana kategorii tutaj poprawia też wszystkie transakcje, które ta reguła już "
        "wcześniej automatycznie sklasyfikowała (nie rusza transakcji, które zostały ręcznie albo przez AI "
        "potwierdzone inaczej). Kategorię pojedynczej transakcji zmienisz w zakładce „Historia transakcji”."
    )
    rules = merchant_rules(connection)
    if not rules:
        st.info("Nie masz jeszcze żadnych reguł — powstają po zatwierdzeniu kategorii z opcją „zapamiętaj regułę”.")
        return

    options = category_options(data["categories"])
    label_by_key = {key: label for label, key in options.items()}
    rules_by_id = {int(rule["id"]): rule for rule in rules}
    rows = [
        {
            "rule_id": int(rule["id"]),
            "Sprzedawca": str(rule["merchant_key"]).title(),
            "Kategoria": label_by_key.get(rule["category_key"], rule["category_label"]),
            "Usuń": False,
        }
        for rule in rules
    ]
    df = pd.DataFrame(rows)
    edited = st.data_editor(
        df,
        column_order=["Sprzedawca", "Kategoria", "Usuń"],
        column_config={
            "Sprzedawca": st.column_config.TextColumn(disabled=True),
            "Kategoria": st.column_config.SelectboxColumn(options=list(options)),
            "Usuń": st.column_config.CheckboxColumn(
                help="Usuń tę regułę — przyszłe transakcje tego sprzedawcy przestaną klasyfikować się same."
            ),
        },
        hide_index=True,
        key="merchant_rules_editor",
    )
    if st.button("Zapisz zmiany w regułach", type="primary"):
        changed = 0
        deleted = 0
        for _, row in edited.iterrows():
            rule_id = int(row["rule_id"])
            if row["Usuń"]:
                delete_merchant_rule(connection, rule_id)
                deleted += 1
                continue
            new_key = options[row["Kategoria"]]
            if new_key != rules_by_id[rule_id]["category_key"]:
                update_merchant_rule(connection, rule_id, new_key)
                changed += 1
        if changed or deleted:
            st.toast(f"Zaktualizowano {changed} reguł, usunięto {deleted}.")
            st.rerun()
        else:
            st.info("Brak zmian do zapisania.")
