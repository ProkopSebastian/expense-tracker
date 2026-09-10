from __future__ import annotations

import streamlit as st

from expense_tracker.config import settings
from expense_tracker.dashboard_data import snapshot
from expense_tracker.data_sync import sync_data_directory
from expense_tracker.database import Database
from expense_tracker.ui import classification_tab, classified_tab, ledger_tab, summary_tab
from expense_tracker.ui.state import get_database


def _handle_refresh(database: Database) -> None:
    with st.spinner("Sprawdzam nowe pliki w folderze data..."):
        result = sync_data_directory(database, settings.data_dir)
    if not result.new_files and not result.unsupported_files and not result.error_files:
        st.toast("Wszystko jest już aktualne.")
    if result.new_files:
        st.toast(f"Dodano {result.transactions_inserted} nowych transakcji z {len(result.new_files)} plików.")
    for name in result.unsupported_files:
        st.warning(f"Nie rozpoznano formatu pliku „{name}”. Sprawdź, czy pochodzi z obsługiwanego banku.")
    for name, error in result.error_files:
        st.error(f"Błąd w pliku „{name}”: {error}")
    st.rerun()


def main() -> None:
    st.set_page_config(page_title="Analiza wydatków", page_icon="💳", layout="wide")
    title_col, button_col = st.columns([5, 1])
    title_col.title("Analiza wydatków")
    title_col.caption("Wszystkie dane zostają na Twoim komputerze.")

    database = get_database()
    if button_col.button("🔄 Odśwież dane", width="stretch"):
        _handle_refresh(database)

    data = snapshot(database.connection)

    if not data["transactions"]:
        st.info(
            "Nie masz jeszcze żadnych transakcji. Wrzuć plik z historią konta do folderu `data` "
            "i kliknij „🔄 Odśwież dane”."
        )
        return

    summary_view, ledger_view, classification_view, classified_view = st.tabs(
        ["Podsumowanie", "Historia transakcji", "Do klasyfikacji", "Reguły sprzedawców"]
    )
    with summary_view:
        summary_tab.render(data)
    with ledger_view:
        ledger_tab.render(database.connection, data)
    with classification_view:
        classification_tab.render(database.connection, data)
    with classified_view:
        classified_tab.render(database.connection, data)


if __name__ == "__main__":
    main()
