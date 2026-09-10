from __future__ import annotations

import streamlit as st

from expense_tracker.config import settings
from expense_tracker.dashboard_data import snapshot
from expense_tracker.data_sync import sync_data_directory
from expense_tracker.database import Database
from expense_tracker.ui import classification_tab, classified_tab, ledger_tab, summary_tab
from expense_tracker.ui.state import get_database


def _auto_sync(database: Database) -> None:
    result = sync_data_directory(database, settings.data_dir)
    if result.new_files:
        st.toast(f"Zaimportowano {result.transactions_inserted} nowych transakcji z {len(result.new_files)} plików.")
    for name in result.unsupported_files:
        st.warning(f"Nie rozpoznano formatu pliku „{name}”. Sprawdź, czy pochodzi z obsługiwanego banku.")
    for name, error in result.error_files:
        st.error(f"Błąd w pliku „{name}”: {error}")


def main() -> None:
    st.set_page_config(page_title="Analiza wydatków", page_icon="💳", layout="wide")
    st.title("Analiza wydatków")
    st.caption("Wszystkie dane zostają na Twoim komputerze. Nowe pliki z folderu `data` wczytują się automatycznie.")

    database = get_database()
    _auto_sync(database)
    data = snapshot(database.connection)

    if not data["transactions"]:
        st.info("Nie masz jeszcze żadnych transakcji. Wrzuć plik z historią konta do folderu `data` i odśwież stronę.")
        return

    summary_view, ledger_view, classification_view, classified_view = st.tabs(
        ["Podsumowanie", "Historia transakcji", "Do klasyfikacji", "Zaklasyfikowane"]
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
