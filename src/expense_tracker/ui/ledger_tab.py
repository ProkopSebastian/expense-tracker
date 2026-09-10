from __future__ import annotations

import sqlite3
from datetime import date
from decimal import Decimal

import pandas as pd
import streamlit as st

from ..dashboard_data import LedgerData
from ..ledger import (
    add_manual_transaction,
    approve_suggestion,
    create_case,
    dissolve_case,
    infer_case_member_role,
    reject_suggestion,
    save_decision,
)
from .formatting import category_options, pln

KIND_LABELS = {
    "Wspólny zakup (ja płacę, ktoś mi odda część)": "shared_purchase",
    "Rozliczenie (ktoś zapłacił za mnie, ja mu oddaję)": "reimbursement",
    "Zwrot od sprzedawcy": "refund",
    "Transfer między moimi własnymi kontami": "own_transfer",
    "Sporna lub cofnięta płatność": "payment_dispute",
}
ROLE_LABELS = {
    "purchase": "Zakup",
    "received_reimbursement": "Otrzymany zwrot od znajomego",
    "paid_settlement": "Spłata rozliczenia",
    "received_refund": "Otrzymany zwrot od sprzedawcy",
    "account_transfer": "Przelew między kontami",
}


DIRECTION_ALL = "Wszystkie"
DIRECTION_EXPENSE = "Wydatki"
DIRECTION_INCOME = "Wpływy"
GROUPS_PER_PAGE = 100


def _row_style(kind: str, width: int) -> list[str]:
    if kind == "case_summary":
        return ["background-color: rgba(99, 102, 241, 0.35); font-weight: 700"] * width
    if kind == "case_member":
        return ["background-color: rgba(99, 102, 241, 0.12)"] * width
    return [""] * width


def _block_direction(df: pd.DataFrame) -> pd.Series:
    # A group's real signed amount only lives on one row (the standalone row itself, or the case's
    # header row) — member rows carry None. Broadcast that one value to every row sharing the same
    # _group_id, so filtering by direction includes or excludes a whole group together.
    return df.groupby("_group_id")["Kwota rzeczywista"].transform(
        lambda amounts: next((amount for amount in amounts if pd.notna(amount)), 0.0)
    )


def _render_table(rows: list[dict[str, object]]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    block_amount = _block_direction(df)

    search = st.text_input("Szukaj w opisie lub kontrahencie")
    filter_col1, filter_col2 = st.columns([1, 2])
    direction = filter_col1.radio("Kierunek", [DIRECTION_ALL, DIRECTION_EXPENSE, DIRECTION_INCOME], horizontal=True)
    category_choices = sorted(df["Kategoria"].unique())
    selected_categories = filter_col2.multiselect("Filtruj po kategorii", category_choices)

    mask = pd.Series(True, index=df.index)
    if search:
        needle = search.casefold()
        mask &= df["Opis"].str.casefold().str.contains(needle, na=False) | df["Kontrahent"].str.casefold().str.contains(
            needle, na=False
        )
    if direction == DIRECTION_EXPENSE:
        mask &= block_amount < 0
    elif direction == DIRECTION_INCOME:
        mask &= block_amount > 0
    if selected_categories:
        mask &= df["Kategoria"].isin(selected_categories)
    df = df[mask]

    if df.empty:
        st.info("Brak transakcji pasujących do filtrów.")
        return df.iloc[0:0]

    group_ids = list(dict.fromkeys(df["_group_id"]))
    page_count = max(1, (len(group_ids) + GROUPS_PER_PAGE - 1) // GROUPS_PER_PAGE)
    if st.session_state.get("ledger_page", 1) > page_count:
        st.session_state["ledger_page"] = 1
    page = st.selectbox("Strona", range(1, page_count + 1), key="ledger_page") if page_count > 1 else 1
    first_group = (page - 1) * GROUPS_PER_PAGE
    visible_group_ids = set(group_ids[first_group : first_group + GROUPS_PER_PAGE])
    visible_df = df[df["_group_id"].isin(visible_group_ids)]

    display = visible_df.drop(columns=["id", "_kind", "_category_key", "_group_id"])
    kinds = visible_df["_kind"]
    styled = display.style.apply(lambda row: _row_style(kinds.loc[row.name], len(row)), axis=1)
    st.caption(
        "🔗 nagłówek grupy (liczy się do sumy) · ↳ transakcja wchodząca w jej skład (widoczna, ale nie liczona "
        "osobno). Zaznacz jedną transakcję, żeby szybko zmienić jej kategorię, albo kilka, żeby je zgrupować."
    )
    if page_count > 1:
        st.caption(f"Strona {page} z {page_count} · {len(df)} pasujących wierszy")
    event = st.dataframe(
        styled,
        column_config={
            "Kwota": st.column_config.NumberColumn(format="%.2f"),
            "Kwota rzeczywista": st.column_config.NumberColumn(format="%.2f"),
        },
        on_select="rerun",
        selection_mode="multi-row",
        hide_index=True,
        key="ledger_table",
        height=420,
    )
    if event and event.selection.rows:
        return visible_df.iloc[event.selection.rows]
    return df.iloc[0:0]


def _recategorize_form(
    connection: sqlite3.Connection, selected: pd.DataFrame, categories: list[dict[str, object]]
) -> None:
    row = selected.iloc[0]
    if pd.isna(row["id"]) or row["_kind"] != "standalone":
        st.info("Kategorię pojedynczej transakcji można zmienić tylko dla samodzielnego wiersza (nie nagłówka grupy).")
        return
    options = category_options(categories)
    label_by_key = {key: label for label, key in options.items()}
    current_label = label_by_key.get(row["_category_key"], "Do przypisania")
    transaction_id = int(row["id"])

    def _on_change() -> None:
        new_label = st.session_state[f"recategorize_{transaction_id}"]
        save_decision(connection, transaction_id, options[new_label])
        st.toast(f"Zapisano kategorię „{new_label}”.")

    st.divider()
    st.caption(f"Zmień kategorię: **{row['Opis']}** ({row['Kwota']} {row['Waluta']})")
    all_options = [current_label, *[label for label in options if label != current_label]]
    st.selectbox("Kategoria", all_options, key=f"recategorize_{transaction_id}", on_change=_on_change)


def _merge_form(connection: sqlite3.Connection, selected: pd.DataFrame, categories: list[dict[str, object]]) -> None:
    if selected.empty:
        return
    st.divider()
    ineligible = selected[selected["id"].isna() | (selected["Grupa"] != "—")]
    if not ineligible.empty:
        st.warning("Zaznaczenie zawiera nagłówek grupy albo transakcję już należącą do grupy — pomiń je.")
        return
    if len(selected) < 2:
        st.info("Zaznacz co najmniej dwie transakcje, żeby połączyć je w grupę.")
        return
    if selected["Waluta"].nunique() != 1:
        st.warning("Zaznaczone transakcje muszą być w jednej walucie.")
        return
    currency = str(selected["Waluta"].iloc[0])
    raw_total = sum((Decimal(str(amount)) for amount in selected["Kwota"]), Decimal(0))
    st.subheader("Połącz zaznaczone transakcje w grupę")
    st.caption(
        f"Zaznaczyłeś {len(selected)} transakcji, suma surowych kwot: {raw_total:.2f} {currency}. Grupa liczy "
        "się jako JEDNA pozycja w JEDNEJ kategorii — albo wydatek, albo wpływ, nigdy oba naraz — na kwotę "
        "„Twój rzeczywisty koszt” podaną niżej. Surowe transakcje zostają widoczne w Historii dla wglądu, ale "
        "do sum i wykresów wchodzi tylko ta jedna, ustalona niżej kwota."
    )
    with st.form("merge_case", clear_on_submit=True):
        title = st.text_input("Nazwa grupy", placeholder="Loty do Lizbony")
        kind_label = st.selectbox("Co się właściwie stało?", list(KIND_LABELS))
        kind = KIND_LABELS[kind_label]
        options = category_options(categories)
        if kind == "own_transfer":
            st.caption("Transfer własny: kategoria i Twój koszt są ustawiane automatycznie na zero.")
            category_key = "transfer_own"
            personal_amount = Decimal(0)
        else:
            category_label = st.selectbox("Kategoria", list(options))
            category_key = options[category_label]
            suggested = -sum((Decimal(str(amount)) for amount in selected["Kwota"]), Decimal(0))
            direction = st.radio("Kierunek", ["Wydatek", "Zwrot na moją korzyść"], horizontal=True)
            magnitude = st.number_input("Twój rzeczywisty koszt", min_value=0.0, value=float(abs(suggested)), step=1.0)
            personal_amount = Decimal(str(magnitude)) if direction == "Wydatek" else -Decimal(str(magnitude))
        st.caption(
            "Rola każdej transakcji — czysto opisowa, nie wpływa na wyliczenia, ułatwia tylko późniejsze "
            "zrozumienie, co się z każdą z nich stało:"
        )
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
        submitted = st.form_submit_button("Utwórz grupę", type="primary")
    if submitted:
        if not title:
            st.error("Podaj nazwę grupy.")
            return
        create_case(connection, kind, title, category_key, personal_amount, currency, list(roles.items()))
        st.toast("Grupa utworzona.")
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
            st.toast("Dodano wydatek.")
            st.rerun()


def _cases_section(connection: sqlite3.Connection, cases: list[dict[str, object]]) -> None:
    st.subheader("Twoje grupy")
    if not cases:
        st.caption("Nie masz jeszcze żadnych grup.")
        return
    table = [
        {
            "Grupa": case["title"],
            "Kategoria": case["category_label"] or "—",
            "Twój koszt": pln(Decimal(str(case["personal_amount"]))),
            "Waluta": case["currency"],
            "Data": case["booking_date"],
        }
        for case in cases
    ]
    st.dataframe(table, hide_index=True, width="stretch")
    case_options = {f"{case['title']} ({case['booking_date']})": int(case["id"]) for case in cases}
    selected_label = st.selectbox("Rozwiąż grupę", list(case_options))
    if st.button("Rozwiąż grupę"):
        dissolve_case(connection, case_options[selected_label])
        st.toast("Grupa rozwiązana, transakcje wróciły do rejestru.")
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
            st.toast("Grupa utworzona z sugestii AI.")
            st.rerun()
        if reject_col.button("Odrzuć", key=f"reject_relation_{suggestion['id']}"):
            reject_suggestion(connection, int(suggestion["id"]))
            st.toast("Sugestia odrzucona.")
            st.rerun()


def render(connection: sqlite3.Connection, data: LedgerData) -> None:
    selected = _render_table(data["ledger_rows"])
    if len(selected) == 1:
        _recategorize_form(connection, selected, data["categories"])
    else:
        _merge_form(connection, selected, data["categories"])
    _manual_entry_form(connection, data["categories"])
    st.divider()
    _relation_suggestions_section(connection, data["suggestions"])
    _cases_section(connection, data["cases"])
