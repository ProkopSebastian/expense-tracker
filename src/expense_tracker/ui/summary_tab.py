from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from ..reporting import category_breakdown, summary
from .formatting import chart_slices, pln

PATH_KEY = "drilldown_path"
NO_SELECTION = "— wszystkie —"


def _figure(slices: list[dict[str, object]], kind: str):
    # A single trace with explicit per-point colors (rather than px's color= grouping) is used
    # deliberately: px.bar splits color= into one trace per category, which would silently
    # misalign a whole-dataframe customdata array across traces and break click identification.
    df = pd.DataFrame(slices)
    if kind == "Kołowy":
        fig = px.pie(df, names="label", values="total")
        fig.update_traces(marker={"colors": df["color"]}, textinfo="label+percent", customdata=df[["key"]])
    else:
        fig = px.bar(df, x="label", y="total")
        fig.update_traces(marker_color=df["color"], customdata=df[["key"]])
        fig.update_layout(xaxis_title=None, yaxis_title="Wydatki (zł)")
    fig.update_layout(
        margin={"t": 10, "b": 10, "l": 10, "r": 10}, showlegend=(kind == "Kołowy"), clickmode="event+select"
    )
    return fig


def filtered_items(items: list[dict[str, object]], month: str) -> list[dict[str, object]]:
    return [item for item in items if str(item["date"]).startswith(month)]


def _resolve_path(breakdown: dict[str, dict], path: list[str]) -> tuple[list[str], dict[str, dict]]:
    valid_path: list[str] = []
    level = breakdown
    for key in path:
        if key not in level:
            break
        valid_path.append(key)
        level = level[key].get("children", {})
    return valid_path, level


def render(data: dict[str, object]) -> None:
    months = sorted({str(item["date"])[:7] for item in data["items"]}, reverse=True)
    if not months:
        st.info("Brak wydatków lub przychodów do pokazania.")
        return
    month = st.selectbox("Miesiąc", months)
    items = filtered_items(data["items"], month)
    metrics = summary(items)
    first, second, third = st.columns(3)
    first.metric("Wydatki", pln(metrics["expenses"]))
    second.metric("Przychody", pln(metrics["income"]))
    third.metric("Bilans miesiąca", pln(metrics["balance"]))

    breakdown = category_breakdown(items, data["categories"])
    if not breakdown:
        st.info("Brak wydatków w tym miesiącu.")
        return

    raw_path = st.session_state.get(PATH_KEY, [])
    path, level = _resolve_path(breakdown, raw_path)
    if path != raw_path:
        st.session_state[PATH_KEY] = path

    st.subheader("Wydatki według kategorii")
    kind = st.radio("Widok", ["Kołowy", "Słupkowy"], horizontal=True, key="summary_chart_kind")

    if path:
        crumbs = " → ".join(_label_for(breakdown, path[: i + 1]) for i in range(len(path)))
        crumb_col, back_col = st.columns([4, 1])
        crumb_col.caption(crumbs)
        if back_col.button("← Wróć"):
            st.session_state[PATH_KEY] = path[:-1]
            st.rerun()

    slices = chart_slices(level)
    if not slices:
        st.info("Brak danych na tym poziomie.")
        return

    event = st.plotly_chart(_figure(slices, kind), on_select="rerun", selection_mode="points", key=f"chart_{len(path)}")
    can_drill = len(path) < 2
    if can_drill and event and event.selection.points:
        clicked_key = event.selection.points[0]["customdata"][0]
        if clicked_key != "__other" and len(level.get(clicked_key, {}).get("children", {})) > 1:
            st.session_state[PATH_KEY] = [*path, clicked_key]
            st.rerun()

    if can_drill:
        drillable = {data["label"]: key for key, data in level.items() if len(data.get("children", {})) > 1}
        if drillable:
            choice = st.selectbox(
                "Albo wybierz kategorię z listy, żeby zobaczyć jej podział", [NO_SELECTION, *drillable]
            )
            if choice != NO_SELECTION:
                st.session_state[PATH_KEY] = [*path, drillable[choice]]
                st.rerun()


def _label_for(breakdown: dict[str, dict], path: list[str]) -> str:
    level = breakdown
    label = ""
    for key in path:
        label = level[key]["label"]
        level = level[key].get("children", {})
    return label
