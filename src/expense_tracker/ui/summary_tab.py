from __future__ import annotations

import calendar
from datetime import date, timedelta

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from ..dashboard_data import SummaryData
from ..reporting import category_breakdown, summary
from .formatting import chart_slices, family_color, money

PATH_KEY = "drilldown_path"
CHART_REVISION_KEY = "summary_chart_revision"
PERIOD_SIGNATURE_KEY = "summary_period_signature"
PERIOD_MODES = ("Miesiąc", "30 dni", "3 miesiące", "Rok", "Własny zakres")
POLISH_MONTHS = (
    "styczeń",
    "luty",
    "marzec",
    "kwiecień",
    "maj",
    "czerwiec",
    "lipiec",
    "sierpień",
    "wrzesień",
    "październik",
    "listopad",
    "grudzień",
)


def _soften(color: str) -> str:
    """Move an inactive slice towards the page background without losing its identity."""
    red, green, blue = (int(color[index : index + 2], 16) for index in range(1, 6, 2))
    softened = (round(channel * 0.35 + 255 * 0.65) for channel in (red, green, blue))
    return "#" + "".join(f"{channel:02x}" for channel in softened)


def _figure(slices: list[dict[str, object]], kind: str, currency: str, active_key: str | None = None):
    df = pd.DataFrame(slices)
    colors = [
        str(row.color) if active_key is None or row.key == active_key else _soften(str(row.color))
        for row in df.itertuples()
    ]
    if kind == "Kołowy":
        fig = px.pie(df, names="label", values="total", hole=0.48)
        fig.update_traces(
            marker={"colors": colors, "line": {"color": "white", "width": 2}},
            textinfo="label+percent",
            textposition="inside",
            customdata=df[["key"]],
            pull=[0.06 if row.key == active_key else 0 for row in df.itertuples()],
            hovertemplate=f"<b>%{{label}}</b><br>%{{value:,.2f}} {currency} · %{{percent}}<extra></extra>",
        )
    else:
        fig = px.bar(df, x="label", y="total")
        fig.update_traces(
            marker_color=colors,
            customdata=df[["key"]],
            text=[money(row.total, currency) for row in df.itertuples()],
            textposition="outside",
            cliponaxis=False,
            hovertemplate=f"<b>%{{x}}</b><br>%{{y:,.2f}} {currency}<extra></extra>",
        )
        fig.update_layout(xaxis_title=None, yaxis_title=f"Wydatki ({currency})", yaxis={"rangemode": "tozero"})
    fig.update_layout(
        margin={"t": 16, "b": 10, "l": 10, "r": 10},
        showlegend=False,
        clickmode="event+select",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        uniformtext={"minsize": 11, "mode": "hide"},
    )
    return fig


def _sunburst_figure(breakdown: dict[str, dict], currency: str, period_signature: str) -> go.Figure:
    """Build a client-side hierarchical chart; Plotly handles drill-down without a Streamlit rerun."""
    ids = ["root"]
    labels = ["Wydatki"]
    parents = [""]
    values = [sum(float(node["total"]) for node in breakdown.values())]
    colors = ["rgba(0,0,0,0)"]
    top_colors = {
        str(item["key"]): str(item["color"]) for item in chart_slices(breakdown, limit=max(len(breakdown), 1))
    }

    def add_level(level: dict[str, dict], parent_id: str, family_key: str | None = None) -> None:
        for key, node in sorted(level.items(), key=lambda item: item[1]["total"], reverse=True):
            node_id = f"{parent_id}/{key}"
            node_family = family_key or key
            ids.append(node_id)
            labels.append(str(node["label"]))
            parents.append(parent_id)
            values.append(float(node["total"]))
            color = top_colors.get(node_family, "#9ca3af") if family_key is None else family_color(node_family, node_id)
            colors.append(color)
            add_level(node.get("children", {}), node_id, node_family)

    add_level(breakdown, "root")
    figure = go.Figure(
        go.Sunburst(
            ids=ids,
            labels=labels,
            parents=parents,
            values=values,
            branchvalues="total",
            maxdepth=2,
            marker={"colors": colors, "line": {"color": "white", "width": 2}},
            sort=False,
            insidetextorientation="horizontal",
            hovertemplate=f"<b>%{{label}}</b><br>%{{value:,.2f}} {currency}<extra></extra>",
        )
    )
    figure.update_layout(
        height=540,
        margin={"t": 12, "b": 12, "l": 12, "r": 12},
        paper_bgcolor="rgba(0,0,0,0)",
        uniformtext={"minsize": 11, "mode": "hide"},
        uirevision=period_signature,
    )
    return figure


def filtered_items(items: list[dict[str, object]], start: date, end: date, currency: str) -> list[dict[str, object]]:
    return [
        item for item in items if item["currency"] == currency and start <= date.fromisoformat(str(item["date"])) <= end
    ]


def _month_label(month: str) -> str:
    year, month_number = (int(part) for part in month.split("-"))
    return f"{month_number:02d} — {POLISH_MONTHS[month_number - 1]} {year}"


def _month_bounds(month: str) -> tuple[date, date]:
    year, month_number = (int(part) for part in month.split("-"))
    return date(year, month_number, 1), date(year, month_number, calendar.monthrange(year, month_number)[1])


def _three_month_start(anchor: date) -> date:
    month_index = anchor.year * 12 + anchor.month - 3
    return date(month_index // 12, month_index % 12 + 1, 1)


def _resolve_path(breakdown: dict[str, dict], path: list[str]) -> tuple[list[str], dict[str, dict]]:
    valid_path: list[str] = []
    level = breakdown
    for key in path:
        if key not in level:
            break
        valid_path.append(key)
        level = level[key].get("children", {})
    return valid_path, level


def _clicked_key(event: object, slices: list[dict[str, object]]) -> str | None:
    """Resolve a native Streamlit Plotly selection to its chart slice."""
    if not event:
        return None

    selection = event.get("selection", {})
    points = selection.get("points", [])
    if not points:
        return None

    customdata = points[0].get("customdata")
    if customdata:
        return str(customdata[0])

    point_number = points[0].get("point_number", points[0].get("point_index"))
    if isinstance(point_number, int) and 0 <= point_number < len(slices):
        return str(slices[point_number]["key"])
    return None


def _interactive_chart(figure: object, key: str) -> object:
    """Render a Plotly chart using Streamlit's native selection events."""
    revision = st.session_state.get(CHART_REVISION_KEY, 0)
    return st.plotly_chart(
        figure,
        height=470,
        on_select="rerun",
        selection_mode="points",
        config={"displayModeBar": False, "displaylogo": False, "responsive": True},
        key=f"{key}_{revision}",
    )


def _reset_chart_selection() -> None:
    st.session_state[CHART_REVISION_KEY] = st.session_state.get(CHART_REVISION_KEY, 0) + 1


def _go_back() -> None:
    """Return one drill-down level; the root level has an empty path."""
    st.session_state[PATH_KEY] = list(st.session_state.get(PATH_KEY, []))[:-1]
    _reset_chart_selection()


def _render_charts(breakdown: dict[str, dict], kind: str, currency: str) -> None:
    """Render the drill-down area without rerunning the rest of the dashboard."""
    raw_path = st.session_state.get(PATH_KEY, [])
    path, _ = _resolve_path(breakdown, raw_path)
    if path != raw_path:
        st.session_state[PATH_KEY] = path

    root_slices = chart_slices(breakdown)
    if not root_slices:
        st.info("Brak danych na tym poziomie.")
        return

    if not path:
        st.caption(
            "Kliknij kategorię, aby zobaczyć jej podział obok — w odróżnieniu od widoku kołowego, ten widok "
            "przeładowuje wykres i pokazuje przycisk „← Wróć”, żeby cofnąć się o poziom."
        )
        root_event = _interactive_chart(_figure(root_slices, kind, currency), "summary_root_chart")
        clicked_root_key = _clicked_key(root_event, root_slices)
        if clicked_root_key and clicked_root_key != "__other" and breakdown.get(clicked_root_key, {}).get("children"):
            st.session_state[PATH_KEY] = [clicked_root_key]
            _reset_chart_selection()
            st.rerun(scope="fragment")
        return

    selected_top_key = path[0]
    left, right = st.columns(2, gap="large")
    with left:
        st.caption("Wszystkie kategorie")
        root_event = _interactive_chart(
            _figure(root_slices, kind, currency, active_key=selected_top_key), "summary_root_chart"
        )

    path, detail_level = _resolve_path(breakdown, path)
    detail_slices = chart_slices(detail_level, color_family_key=selected_top_key)
    with right:
        crumbs = " → ".join(_label_for(breakdown, path[: i + 1]) for i in range(len(path)))
        heading, back = st.columns([4, 1])
        heading.caption(f"Wydatki → {crumbs}")
        back.button(
            "← Wróć",
            key="summary_drilldown_back",
            help="Wróć o jeden poziom wyżej",
            on_click=_go_back,
        )
        if detail_slices:
            detail_event = _interactive_chart(
                _figure(detail_slices, kind, currency), f"summary_detail_chart_{len(path)}"
            )
        else:
            detail_event = []
            st.info("Brak dalszego podziału dla tej kategorii.")

    clicked_root_key = _clicked_key(root_event, root_slices)
    if (
        clicked_root_key
        and clicked_root_key != "__other"
        and breakdown.get(clicked_root_key, {}).get("children")
        and clicked_root_key != selected_top_key
    ):
        st.session_state[PATH_KEY] = [clicked_root_key]
        _reset_chart_selection()
        st.rerun(scope="fragment")

    clicked_detail_key = _clicked_key(detail_event, detail_slices)
    if (
        clicked_detail_key
        and clicked_detail_key != "__other"
        and detail_level.get(clicked_detail_key, {}).get("children")
    ):
        st.session_state[PATH_KEY] = [*path, clicked_detail_key]
        _reset_chart_selection()
        st.rerun(scope="fragment")


def _move_month(months: list[str], offset: int) -> None:
    current = st.session_state.get("summary_month", months[0])
    current_index = months.index(current) if current in months else 0
    st.session_state["summary_month"] = months[max(0, min(len(months) - 1, current_index + offset))]


@st.fragment(key="summary")
def render(data: SummaryData) -> None:
    all_items = data["items"]
    if not all_items:
        st.info("Brak wydatków lub przychodów do pokazania.")
        return

    currencies = sorted({str(item["currency"]) for item in all_items}, key=lambda value: (value != "PLN", value))
    if st.session_state.get("summary_currency") not in currencies:
        st.session_state["summary_currency"] = currencies[0]
    all_dates = [date.fromisoformat(str(item["date"])) for item in all_items]
    mode_column, currency_column = st.columns([4, 1])
    mode = mode_column.segmented_control(
        "Okres",
        PERIOD_MODES,
        default="Miesiąc",
        required=True,
        key="summary_period_mode",
        width="stretch",
    )
    currency = currency_column.selectbox("Waluta", currencies, key="summary_currency")
    currency_items = [item for item in all_items if item["currency"] == currency]
    available_dates = [date.fromisoformat(str(item["date"])) for item in currency_items]
    first_available, last_available = min(available_dates), max(available_dates)

    if mode == "Miesiąc":
        months = sorted({str(item["date"])[:7] for item in currency_items}, reverse=True)
        if st.session_state.get("summary_month") not in months:
            st.session_state["summary_month"] = months[0]
        current_index = months.index(st.session_state["summary_month"])
        previous, month_column, following = st.columns([1, 6, 1])
        previous.button(
            "←",
            help="Poprzedni miesiąc",
            on_click=_move_month,
            args=(months, 1),
            disabled=current_index == len(months) - 1,
            width="stretch",
        )
        month = month_column.selectbox(
            "Miesiąc", months, format_func=_month_label, key="summary_month", label_visibility="collapsed"
        )
        following.button(
            "→",
            help="Następny miesiąc",
            on_click=_move_month,
            args=(months, -1),
            disabled=current_index == 0,
            width="stretch",
        )
        start, end = _month_bounds(month)
    elif mode == "30 dni":
        end = last_available
        start = max(first_available, end - timedelta(days=29))
    elif mode == "3 miesiące":
        end = last_available
        start = max(first_available, _three_month_start(end))
    elif mode == "Rok":
        end = last_available
        start = max(first_available, date(end.year, 1, 1))
    else:
        chosen_range = st.date_input(
            "Zakres dat",
            value=(max(first_available, last_available - timedelta(days=29)), last_available),
            min_value=min(all_dates),
            max_value=max(all_dates),
            format="DD.MM.YYYY",
            key="summary_custom_range",
        )
        if not isinstance(chosen_range, tuple) or len(chosen_range) != 2:
            st.info("Wybierz datę początkową i końcową.")
            return
        start, end = chosen_range

    period_signature = f"{start.isoformat()}:{end.isoformat()}:{currency}"
    if st.session_state.get(PERIOD_SIGNATURE_KEY) != period_signature:
        st.session_state[PATH_KEY] = []
        _reset_chart_selection()
        st.session_state[PERIOD_SIGNATURE_KEY] = period_signature

    st.caption(f"{start:%d.%m.%Y}–{end:%d.%m.%Y} · {currency}")
    if len(currencies) > 1:
        st.caption("Waluty są pokazywane osobno — nie przeliczamy ich automatycznie bez wiarygodnego kursu.")

    items = filtered_items(all_items, start, end, currency)
    metrics = summary(items)
    first, second, third = st.columns(3)
    first.metric("Wydatki", money(metrics["expenses"], currency))
    second.metric("Przychody", money(metrics["income"], currency))
    third.metric("Bilans okresu", money(metrics["balance"], currency))

    breakdown = category_breakdown(items, data["categories"])
    if not breakdown:
        st.info("Brak wydatków w wybranym okresie.")
        return

    st.subheader("Wydatki według kategorii")
    kind = st.segmented_control(
        "Widok", ["Kołowy", "Słupkowy"], default="Kołowy", required=True, key="summary_chart_kind"
    )
    if kind == "Kołowy":
        st.caption(
            "Kliknij kategorię, aby wejść głębiej. Kliknij środek wykresu, aby wrócić — bez przeładowania strony."
        )
        st.plotly_chart(
            _sunburst_figure(breakdown, currency, period_signature),
            height=540,
            config={"displayModeBar": False, "displaylogo": False, "responsive": True},
            key="summary_sunburst_chart",
        )
    else:
        _render_charts(breakdown, kind, currency)


def _label_for(breakdown: dict[str, dict], path: list[str]) -> str:
    level = breakdown
    label = ""
    for key in path:
        label = level[key]["label"]
        level = level[key].get("children", {})
    return label
