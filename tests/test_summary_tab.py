from __future__ import annotations

from expense_tracker.ui.summary_tab import _clicked_key, _figure, _sunburst_figure


def test_clicked_key_prefers_plotly_customdata() -> None:
    slices = [{"key": "food"}, {"key": "travel"}]
    event = {"selection": {"points": [{"point_number": 0, "customdata": ["travel"]}]}}

    assert _clicked_key(event, slices) == "travel"


def test_clicked_key_falls_back_to_point_number() -> None:
    slices = [{"key": "food"}, {"key": "travel"}]
    event = {"selection": {"points": [{"point_number": 1}]}}

    assert _clicked_key(event, slices) == "travel"


def test_clicked_key_ignores_empty_selection() -> None:
    assert _clicked_key({"selection": {"points": []}}, [{"key": "food"}]) is None


def test_bar_chart_displays_polish_amount_labels() -> None:
    figure = _figure([{"key": "travel", "label": "Podróże", "total": 1234.5, "color": "#e87ba4"}], "Słupkowy", "PLN")

    assert list(figure.data[0].text) == ["1 234,50 zł"]
    assert figure.data[0].textposition == "outside"


def test_sunburst_contains_the_full_hierarchy() -> None:
    breakdown = {
        "travel": {
            "label": "Podróże",
            "total": 545,
            "children": {
                "flights": {
                    "label": "Loty",
                    "total": 545,
                    "children": {"merchant": {"label": "Linia lotnicza", "total": 545, "children": {}}},
                }
            },
        }
    }

    figure = _sunburst_figure(breakdown, "PLN", "2026-09")
    trace = figure.data[0]

    assert list(trace.ids) == ["root", "root/travel", "root/travel/flights", "root/travel/flights/merchant"]
    assert list(trace.parents) == ["", "root", "root/travel", "root/travel/flights"]
    assert trace.marker.colors[1] != trace.marker.colors[2]
    assert trace.marker.colors[2] != trace.marker.colors[3]
    assert trace.maxdepth == 2
