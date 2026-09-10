from __future__ import annotations

import sqlite3
from datetime import date
from decimal import Decimal

import pandas as pd
import streamlit as st

from ..ledger import (
    add_manual_transaction,
    approve_suggestion,
    create_case,
    dissolve_case,
    infer_case_member_role,
    reject_suggestion,
)
from .formatting import category_options, pln

KIND_LABELS = {
    "Wspólny zakup": "shared_purchase",
    "Transfer między własnymi kontami": "own_transfer",
    "Zwrot": "refund",
    "Rozliczenie": "reimbursement",
    "Spór płatności": "payment_dispute",
}
ROLE_LABELS = {
    "purchase": "Zakup",
    "received_reimbursement": "Otrzymany zwrot od znajomego",
    "paid_settlement": "Spłata rozliczenia",
    "received_refund": "Otrzymany zwrot od sprzedawcy",
    "account_transfer": "Przelew między kontami",
}


def _row_style(kind: str, width: int) -> list[str]:
    if kind == "case_summary":
        return ["background-color: rgba(99, 102, 241, 0.35); font-weight: 700"] * width
    if kind == "case_member":
        return ["background-color: rgba(99, 102, 241, 0.12)"] * width
    return [""] * width


def _render_table(rows: list[dict[str, object]]) -> pd.DataFrame:
    search = st.text_input("Szukaj w opisie lub kontrahencie")
    df = pd.DataFrame(rows)
    if search:
        needle = search.casefold()
        mask = df["Opis"].str.casefold().str.contains(needle, na=False) | df["Kontrahent"].str.casefold().str.contains(
            needle, na=False
        )
        df = df[mask]
    display = df.drop(columns=["id", "_kind"])
    kinds = df["_kind"]
    styled = display.style.apply(lambda row: _row_style(kinds.loc[row.name], len(row)), axis=1)
    st.caption(
        "🔗 nagłówek sprawy (liczy się do sumy) · ↳ transakcja wchodząca w jej skład (widoczna, ale nie liczona osobno)"
    )
    event = st.dataframe(
        styled, on_select="rerun", selection_mode="multi-row", hide_index=True, key="ledger_table", height=420
    )
    if event and event.selection.rows:
        return df.iloc[event.selection.rows]
    return df.iloc[0:0]


def _merge_form(connection: sqlite3.Connection, selected: pd.DataFrame, categories: list[dict[str, object]]) -> None:
    if selected.empty:
        return
    st.divider()
    ineligible = selected[selected["id"].isna() | (selected["Sprawa"] != "—")]
    if not ineligible.empty:
        st.warning("Zaznaczenie zawiera wiersz podsumowania sprawy lub transakcję już należącą do sprawy — pomiń je.")
        return
    if len(selected) < 2:
        st.info("Zaznacz co najmniej dwie transakcje, żeby połączyć je w jedną sprawę.")
        return
    if selected["Waluta"].nunique() != 1:
        st.warning("Zaznaczone transakcje muszą być w jednej walucie.")
        return
    currency = str(selected["Waluta"].iloc[0])
    st.subheader("Połącz zaznaczone transakcje w sprawę")
    with st.form("merge_case", clear_on_submit=True):
        title = st.text_input("Nazwa sprawy", placeholder="Loty do Lizbony")
        kind_label = st.selectbox("Rodzaj", list(KIND_LABELS))
        kind = KIND_LABELS[kind_label]
        options = category_options(categories)
        if kind == "own_transfer":
            st.caption("Transfer własny: kategoria i Twój koszt są ustawiane automatycznie na zero.")
            category_key = "transfer_own"
            personal_amount = Decimal(0)
        else:
            category_label = st.selectbox("Kategoria sprawy", list(options))
            category_key = options[category_label]
            suggested = -sum((Decimal(str(amount)) for amount in selected["Kwota"]), Decimal(0))
            direction = st.radio("Kierunek", ["Wydatek", "Zwrot na moją korzyść"], horizontal=True)
            magnitude = st.number_input("Twój rzeczywisty koszt", min_value=0.0, value=float(abs(suggested)), step=1.0)
            personal_amount = Decimal(str(magnitude)) if direction == "Wydatek" else -Decimal(str(magnitude))
        st.caption("Rola każdej transakcji w sprawie:")
        roles: dict[int, str] = {}
        for _, row in selected.iterrows():
            default_role = infer_case_member_role(kind, Decimal(str(row["Kwota"])))
            role_label = st.selectbox(
                f"{row['Data']} · {row['Kwota']} {row['Waluta']} · {row['Opis']}",
                list(ROLE_LABELS.values()),
                index=list(ROLE_LABELS).index(default_role),
                key=f"role_{int(row['id'])}",
            )
            roles[int(row["id"])] = next(code for code, label in ROLE_LABELS.items() if label == role_label)
        submitted = st.form_submit_button("Utwórz sprawę", type="primary")
    if submitted:
        if not title:
            st.error("Podaj nazwę sprawy.")
            return
        create_case(connection, kind, title, category_key, personal_amount, currency, list(roles.items()))
        st.success("Sprawa utworzona.")
        st.rerun()


def _manual_entry_form(connection: sqlite3.Connection, categories: list[dict[str, object]]) -> None:
    with st.expander("➕ Dodaj wydatek ręcznie"):
        with st.form("manual_entry", clear_on_submit=True):
            entry_date = st.date_input("Data", value=date.today())
            account = st.text_input("Konto / źródło", value="Gotówka")
            direction = st.radio("Rodzaj", ["Wydatek", "Przychód"], horizontal=True)
            magnitude = st.number_input("Kwota", min_value=0.01, step=1.0)
            currency = st.selectbox("Waluta", ["PLN", "EUR", "USD", "GBP"])
            description = st.text_input("Opis")
            counterparty = st.text_input("Kontrahent (opcjonalnie)")
            options = category_options(categories)
            category_label = st.selectbox("Kategoria", list(options))
            submitted = st.form_submit_button("Dodaj wydatek", type="primary")
        if submitted:
            if not description:
                st.error("Podaj opis wydatku.")
                return
            amount = Decimal(str(magnitude)) if direction == "Przychód" else -Decimal(str(magnitude))
            add_manual_transaction(
                connection,
                account=account or "Gotówka",
                booking_date=entry_date,
                amount=amount,
                currency=currency,
                description=description,
                counterparty=counterparty or None,
                category_key=options[category_label],
            )
            st.success("Dodano wydatek.")
            st.rerun()


def _cases_section(connection: sqlite3.Connection, cases: list[dict[str, object]]) -> None:
    st.subheader("Twoje sprawy")
    if not cases:
        st.caption("Nie masz jeszcze żadnych spraw.")
        return
    table = [
        {
            "Sprawa": case["title"],
            "Kategoria": case["category_label"] or "—",
            "Twój koszt": pln(Decimal(str(case["personal_amount"]))),
            "Waluta": case["currency"],
            "Data": case["booking_date"],
        }
        for case in cases
    ]
    st.dataframe(table, hide_index=True, width="stretch")
    case_options = {f"{case['title']} ({case['booking_date']})": int(case["id"]) for case in cases}
    selected_label = st.selectbox("Rozwiąż sprawę", list(case_options))
    if st.button("Rozwiąż sprawę"):
        dissolve_case(connection, case_options[selected_label])
        st.success("Sprawa rozwiązana, transakcje wróciły do rejestru.")
        st.rerun()


def _relation_suggestions_section(connection: sqlite3.Connection, suggestions: list[dict[str, object]]) -> None:
    relations = [suggestion for suggestion in suggestions if suggestion["kind"] == "relation"]
    if not relations:
        return
    st.subheader("Sugerowane przez AI")
    for suggestion in relations:
        payload = suggestion["payload"]
        st.write(
            f"**{payload['title']}** — Twój koszt: {pln(Decimal(str(payload['personal_amount'])))} "
            f"{payload['currency']}. {payload.get('rationale', '')}"
        )
        approve_col, reject_col = st.columns(2)
        if approve_col.button("Zatwierdź", key=f"approve_relation_{suggestion['id']}", type="primary"):
            approve_suggestion(connection, int(suggestion["id"]))
            st.rerun()
        if reject_col.button("Odrzuć", key=f"reject_relation_{suggestion['id']}"):
            reject_suggestion(connection, int(suggestion["id"]))
            st.rerun()


def render(connection: sqlite3.Connection, data: dict[str, object]) -> None:
    selected = _render_table(data["ledger_rows"])
    _merge_form(connection, selected, data["categories"])
    _manual_entry_form(connection, data["categories"])
    st.divider()
    _relation_suggestions_section(connection, data["suggestions"])
    _cases_section(connection, data["cases"])
