"""Transition matrix figure builder and panel renderer."""

from __future__ import annotations

from collections import Counter

from dash import dcc, html
import plotly.graph_objects as go

from colors import COLORS, FONTS, SECTION_HEADER_STYLE
from server.metrics import get_records, get_transition_matrix


def transition_cell_color(run1_correct: int, run2_correct: int, both_wrong: int, count: int) -> str:
    if count <= 0:
        return "rgba(245,245,245,1)"
    alpha = min(0.3 + count / 50.0, 0.9)
    if run1_correct > 0 and run2_correct == 0:
        return f"rgba(59,130,246,{alpha:.2f})"
    if run2_correct > 0 and run1_correct == 0:
        return f"rgba(22,163,74,{alpha:.2f})"
    if both_wrong > 0:
        return f"rgba(220,38,38,{alpha:.2f})"
    return f"rgba(107,114,128,{alpha:.2f})"


def build_transition_matrix_figure(matrix_data: dict, rows: list[str], cols: list[str], run1_name: str, run2_name: str) -> go.Figure:
    n_rows = len(rows)
    n_cols = len(cols)
    shapes = []
    annotations = []
    xs, ys, custom = [], [], []

    run1_correct_total = 0
    run2_correct_total = 0
    for i, r1 in enumerate(rows):
        for j, r2 in enumerate(cols):
            stats = matrix_data.get(r1, {}).get(r2, {"total": 0, "run1_correct": 0, "run2_correct": 0, "both_wrong": 0})
            total = int(stats.get("total", 0))
            r1c = int(stats.get("run1_correct", 0))
            r2c = int(stats.get("run2_correct", 0))
            both = int(stats.get("both_wrong", 0))

            run1_correct_total += r1c
            run2_correct_total += r2c
            fill = transition_cell_color(r1c, r2c, both, total)
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
            if total > 0:
                annotations.append(
                    {"x": j, "y": i, "text": str(total), "showarrow": False, "xref": "x", "yref": "y", "font": {"size": 11, "family": FONTS["mono"], "color": "white"}}
                )

            xs.append(j)
            ys.append(i)
            custom.append((r1, r2, total, r1c, r2c, both))

    delta = run2_correct_total - run1_correct_total
    badge = f"▲ +{delta}" if delta >= 0 else f"▼ {delta}"
    badge_color = COLORS["green_strong"] if delta >= 0 else COLORS["red"]

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=xs,
            y=ys,
            mode="markers",
            marker={"size": 30, "opacity": 0},
            customdata=custom,
            hovertemplate=(
                "Run1 pred subtype: %{customdata[0]}<br>"
                "Run2 pred subtype: %{customdata[1]}<br>"
                "Total: %{customdata[2]}<br>"
                f"{run1_name} correct: %{{customdata[3]}}<br>"
                f"{run2_name} correct: %{{customdata[4]}}<br>"
                "Both wrong: %{customdata[5]}<extra></extra>"
            ),
            showlegend=False,
        )
    )
    fig.update_layout(
        shapes=shapes,
        annotations=annotations
        + [
            {
                "x": max(0, n_cols - 1) - 0.4,
                "y": -0.7,
                "text": f"<b>{badge}</b>",
                "showarrow": False,
                "xref": "x",
                "yref": "y",
                "bgcolor": badge_color,
                "font": {"color": "white", "size": 10, "family": FONTS["mono"]},
                "borderpad": 3,
            }
        ],
        xaxis={"tickvals": list(range(n_cols)), "ticktext": cols, "tickangle": -45, "side": "top", "showgrid": False, "zeroline": False},
        yaxis={"tickvals": list(range(n_rows)), "ticktext": rows, "autorange": "reversed", "showgrid": False, "zeroline": False},
        plot_bgcolor="white",
        paper_bgcolor="white",
        margin={"l": 140, "r": 20, "t": 90, "b": 30},
        height=max(320, n_rows * 36 + 120),
        hoverlabel={"bgcolor": COLORS["bg_header"], "font": {"color": "white"}},
    )
    return fig


def _persistent_failures(run_id1: int, run_id2: int) -> go.Figure:
    rows = get_records({"run_id1": run_id1, "run_id2": run_id2, "limit": 100000, "offset": 0})["data"]
    persistent = [r for r in rows if r.get("pred_subtype") != r.get("true_subtype") and r.get("run2_pred_subtype") != r.get("true_subtype")]
    top5 = Counter(r.get("true_subtype") for r in persistent).most_common(5)
    fig = go.Figure()
    if top5:
        labels = [x[0] for x in top5]
        vals = [x[1] for x in top5]
        fig.add_trace(go.Bar(x=vals, y=labels, orientation="h", marker={"color": COLORS["red"]}))
        fig.update_layout(height=260, margin={"l": 140, "r": 20, "t": 20, "b": 20}, yaxis={"autorange": "reversed"})
    return fig


def render_transition_panel(run_id1: int, run_id2: int, min_count: int, run1_name: str, run2_name: str) -> html.Div:
    payload = get_transition_matrix(run_id1, run_id2, min_count=max(1, int(min_count or 1)))
    if not payload["rows"]:
        return html.Div("No transition changes for selected runs.", style={"padding": "16px", "color": COLORS["text_muted"]})

    fig = build_transition_matrix_figure(payload["data"], payload["rows"], payload["cols"], run1_name, run2_name)

    totals = {"all": 0, "run1": 0, "run2": 0, "both": 0}
    for r1 in payload["data"].values():
        for st in r1.values():
            totals["all"] += st["total"]
            totals["run1"] += st["run1_correct"]
            totals["run2"] += st["run2_correct"]
            totals["both"] += st["both_wrong"]

    return html.Div(
        [
            html.Div(f"Subtype Transition Matrix - {run1_name} -> {run2_name}", style=SECTION_HEADER_STYLE),
            dcc.RadioItems(
                id="store-correctness-filter-input",
                options=[
                    {"label": f"All ({totals['all']})", "value": "all"},
                    {"label": f"{run1_name} subtype correct ({totals['run1']})", "value": "run1"},
                    {"label": f"{run2_name} subtype correct ({totals['run2']})", "value": "run2"},
                    {"label": f"Both wrong ({totals['both']})", "value": "both"},
                ],
                value="all",
                inline=True,
                className="correctness-legend",
            ),
            dcc.Loading(
                dcc.Graph(
                    id="transition-matrix",
                    figure=fig,
                    config={"displayModeBar": False},
                    className="matrix-graph",
                )
            ),
            html.Div("Persistent Failures", style={**SECTION_HEADER_STYLE, "marginTop": "8px"}),
            html.Div(
                dcc.Graph(
                    id="persistent-failures-bar",
                    figure=_persistent_failures(run_id1, run_id2),
                    config={"displayModeBar": False},
                    className="summary-bar-graph",
                ),
                className="summary-bar-panel",
            ),
        ],
        className="matrix-panel transition-matrix-panel",
    )

