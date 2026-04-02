"""Confusion matrix rendering helpers and panel builders."""

from __future__ import annotations

from collections import Counter

from dash import dcc, html
import plotly.graph_objects as go

from colors import COLORS, FONTS, SECTION_HEADER_STYLE
from server.metrics import compute_f1, get_confusion_matrix, get_records, get_subtype_matrix


def _intensity_color(diagonal: bool, norm: float, value: int) -> tuple[str, str]:
    if value <= 0:
        return "rgba(245,245,245,1)", "#d1d5db"
    if diagonal:
        alpha = min(0.25 + norm * 0.7, 0.95)
        return f"rgba(22,163,74,{alpha:.2f})", "white" if alpha > 0.5 else "#14532d"
    alpha = min(0.2 + norm * 0.75, 0.95)
    return f"rgba(220,38,38,{alpha:.2f})", "white" if alpha > 0.4 else "#7f1d1d"


def build_confusion_matrix_figure(matrix_data: dict, row_labels: list[str], col_labels: list[str], title: str = "") -> go.Figure:
    n_rows = len(row_labels)
    n_cols = len(col_labels)
    if n_rows == 0 or n_cols == 0:
        return go.Figure()

    row_sums = {r: sum(int(matrix_data.get(r, {}).get(c, 0)) for c in col_labels) for r in row_labels}
    shapes = []
    annotations = []

    customdata = []
    xs = []
    ys = []

    for i, t_label in enumerate(row_labels):
        rs = max(1, row_sums[t_label])
        for j, p_label in enumerate(col_labels):
            value = int(matrix_data.get(t_label, {}).get(p_label, 0))
            norm = value / rs
            fill, font = _intensity_color(i == j, norm, value)

            shapes.append(
                {
                    "type": "rect",
                    "x0": j - 0.5,
                    "x1": j + 0.5,
                    "y0": i - 0.5,
                    "y1": i + 0.5,
                    "fillcolor": fill,
                    "line": {"color": "white", "width": 1.2},
                    "layer": "below",
                }
            )
            if value > 0:
                annotations.append(
                    {
                        "x": j,
                        "y": i,
                        "text": str(value),
                        "showarrow": False,
                        "font": {"size": 11, "family": FONTS["mono"], "color": font},
                        "xref": "x",
                        "yref": "y",
                    }
                )

            rev = int(matrix_data.get(p_label, {}).get(t_label, 0))
            if i != j and value >= 3 and value > 2 * rev:
                annotations.append(
                    {
                        "x": j + 0.3,
                        "y": i,
                        "text": "→",
                        "showarrow": False,
                        "xref": "x",
                        "yref": "y",
                        "font": {"size": 10, "color": COLORS["text_secondary"]},
                    }
                )

            xs.append(j)
            ys.append(i)
            customdata.append((t_label, p_label, value))

    # F1 badges above matrix columns.
    for j, label in enumerate(col_labels):
        m = compute_f1(matrix_data, label, row_labels, col_labels)
        if m is None:
            continue
        f1 = m["f1"]
        color = COLORS["green_strong"] if f1 >= 0.8 else (COLORS["amber"] if f1 >= 0.5 else COLORS["red"])
        annotations.append(
            {
                "x": j,
                "y": -0.8,
                "text": f"<b>{f1:.0%}</b>",
                "showarrow": False,
                "xref": "x",
                "yref": "y",
                "bgcolor": color,
                "borderpad": 3,
                "font": {"size": 10, "family": FONTS["mono"], "color": "white"},
            }
        )

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=xs,
            y=ys,
            mode="markers",
            marker={"size": 30, "opacity": 0},
            customdata=customdata,
            hovertemplate="True: %{customdata[0]}<br>Predicted: %{customdata[1]}<br>Count: %{customdata[2]}<extra></extra>",
            showlegend=False,
        )
    )

    fig.add_trace(
        go.Scatter(
            x=[i + 0.38 for i in range(min(n_rows, n_cols))],
            y=[i - 0.38 for i in range(min(n_rows, n_cols))],
            mode="markers",
            marker={"symbol": "triangle-up", "size": 8, "color": COLORS["green_strong"], "opacity": 0.7},
            hoverinfo="skip",
            showlegend=False,
        )
    )

    ytick = [f"⚠ {lbl}" if row_sums.get(lbl, 0) < 10 and row_sums.get(lbl, 0) > 0 else lbl for lbl in row_labels]
    fig.update_layout(
        title=title,
        shapes=shapes,
        annotations=annotations,
        xaxis={"tickvals": list(range(n_cols)), "ticktext": col_labels, "tickangle": -45, "side": "top", "showgrid": False, "zeroline": False},
        yaxis={"tickvals": list(range(n_rows)), "ticktext": ytick, "autorange": "reversed", "showgrid": False, "zeroline": False},
        plot_bgcolor="white",
        paper_bgcolor="white",
        hoverlabel={"bgcolor": COLORS["bg_header"], "font": {"color": "white"}},
        margin={"l": 140, "r": 20, "t": 100, "b": 30},
        height=max(300, n_rows * 36 + 120),
    )
    return fig


def most_misclassified_bar(run_id: int, true_type: str, pred_type: str, incorrect_only: bool) -> go.Figure:
    data = get_records(
        {
            "run_id": run_id,
            "true_type": true_type,
            "pred_type": pred_type,
            "incorrect_only": incorrect_only,
            "limit": 100000,
            "offset": 0,
        }
    )["data"]
    counter = Counter(row.get("true_subtype") for row in data if row.get("pred_subtype") != row.get("true_subtype"))
    top5 = counter.most_common(5)
    fig = go.Figure()
    if top5:
        labels = [x[0] for x in top5]
        vals = [x[1] for x in top5]
        fig.add_trace(
            go.Bar(
                x=vals,
                y=labels,
                orientation="h",
                customdata=[[lbl, None] for lbl in labels],
                marker={"color": COLORS["red"]},
                hovertemplate="Subtype: %{y}<br>Errors: %{x}<extra></extra>",
            )
        )
        fig.update_layout(height=260, margin={"l": 150, "r": 20, "t": 20, "b": 20}, yaxis={"autorange": "reversed"})
    return fig


def render_type_confusion_panel(run_id: int, filter_mode: str) -> html.Div:
    incorrect_only = filter_mode == "incorrect"
    payload = get_confusion_matrix(run_id, incorrect_only=incorrect_only)
    matrix = payload["type_matrix"]
    rows = matrix["rows"]
    cols = matrix["cols"]
    if not rows:
        return html.Div("No confusion matrix data.", style={"padding": "16px", "color": COLORS["text_muted"]})

    fig = build_confusion_matrix_figure(matrix["data"], rows, cols)
    return html.Div(
        [
            html.Div("Type Confusion Matrix", style=SECTION_HEADER_STYLE),
            dcc.Loading(
                dcc.Graph(
                    id="type-confusion-matrix",
                    figure=fig,
                    config={"displayModeBar": False},
                    className="matrix-graph",
                )
            ),
            html.Div(id="subtype-matrix-container"),
        ]
        ,
        className="matrix-panel type-matrix-panel",
    )


def render_subtype_confusion_panel(run_id: int, true_type: str | None, pred_type: str | None, filter_mode: str) -> html.Div:
    if not true_type or not pred_type:
        return html.Div(
            "Click a cell in the Type Confusion Matrix above to view subtypes.",
            style={"padding": "12px", "color": COLORS["text_muted"]},
        )

    incorrect_only = filter_mode == "incorrect"
    matrix = get_subtype_matrix(run_id, true_type, pred_type, incorrect_only=incorrect_only)
    if not matrix["rows"]:
        return html.Div("No subtype data for this type pair.", style={"padding": "12px", "color": COLORS["text_muted"]})

    fig = build_confusion_matrix_figure(matrix["data"], matrix["rows"], matrix["cols"])
    bar_fig = most_misclassified_bar(run_id, true_type, pred_type, incorrect_only)
    return html.Div(
        [
            html.Div(
                [
                    html.Div(f"Subtype Confusion Matrix - {true_type} -> {pred_type}", style=SECTION_HEADER_STYLE),
                ]
            ),
            dcc.Loading(
                dcc.Graph(
                    id="subtype-confusion-matrix",
                    figure=fig,
                    config={"displayModeBar": False},
                    className="matrix-graph",
                )
            ),
            html.Div("Most Misclassified", style={**SECTION_HEADER_STYLE, "marginTop": "8px"}),
            html.Div(
                dcc.Graph(
                    id="misclassified-bar",
                    figure=bar_fig,
                    config={"displayModeBar": False},
                    className="summary-bar-graph",
                ),
                className="summary-bar-panel",
            ),
        ]
        ,
        className="matrix-panel subtype-matrix-panel",
    )

