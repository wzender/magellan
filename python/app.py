"""Dash app entrypoint for classification evaluation dashboard."""

from __future__ import annotations

from dash import Dash, Input, Output, State, callback_context, dcc, html

from colors import CARD_STYLE, COLORS, FONTS
from components.confusion_matrix import (
    render_subtype_confusion_panel,
    render_type_confusion_panel,
)
from components.leaderboard import make_leaderboard
from components.record_table import make_record_table
from components.transition_matrix import render_transition_panel
from server.loader import loader
from server.metrics import get_records


def build_record_panel_title(matrix_cell, subtype_cell) -> str:
    if subtype_cell and subtype_cell.get("run1_pred_subtype"):
        return (
            "Transition Records - "
            f"{subtype_cell.get('run1_pred_subtype')} -> "
            f"{subtype_cell.get('run2_pred_subtype')}"
        )
    if matrix_cell and subtype_cell and subtype_cell.get("true_subtype"):
        pred_subtype = subtype_cell.get("pred_subtype")
        if pred_subtype:
            return (
                "Records - "
                f"{matrix_cell.get('true_type')} -> {matrix_cell.get('pred_type')} - "
                f"{subtype_cell.get('true_subtype')} -> {pred_subtype}"
            )
        return (
            "Records - "
            f"{matrix_cell.get('true_type')} -> {matrix_cell.get('pred_type')} - "
            f"{subtype_cell.get('true_subtype')}"
        )
    if matrix_cell:
        return f"Records - {matrix_cell.get('true_type')} -> {matrix_cell.get('pred_type')}"
    return "All Records"

app = Dash(__name__, suppress_callback_exceptions=True)
app.title = "Classification Evaluation Dashboard"


app.layout = html.Div(
    style={
        "background": COLORS["bg_page"],
        "minHeight": "100vh",
        "fontFamily": FONTS["body"],
        "padding": "24px",
    },
    children=[
        dcc.Store(id="store-benchmark"),
        dcc.Store(id="store-selected-runs", data=[]),
        dcc.Store(id="store-matrix-cell"),
        dcc.Store(id="store-subtype-cell"),
        dcc.Store(id="store-filter-mode", data="all"),
        dcc.Store(id="store-correctness-filter", data="all"),
        html.Div(
            style={
                "display": "flex",
                "alignItems": "center",
                "marginBottom": "20px",
                "gap": "16px",
            },
            children=[
                html.H1(
                    "Classification Evaluation & Analysis",
                    style={
                        "fontSize": FONTS["size"]["xl"],
                        "fontWeight": "700",
                        "color": COLORS["text_primary"],
                        "margin": "0",
                    },
                ),
                dcc.Dropdown(
                    id="benchmark-selector",
                    clearable=False,
                    style={
                        "width": "260px",
                        "fontSize": FONTS["size"]["sm"],
                    },
                ),
            ],
        ),
        html.Div(id="leaderboard-panel", style=CARD_STYLE),
        html.Div(
            id="filter-toolbar",
            style={"display": "none", "marginBottom": "12px"},
            children=[
                html.Div(
                    id="incorrect-only-control",
                    style={"display": "none"},
                    children=[
                        html.Span("Records Filter: ", style={"marginRight": "8px"}),
                        dcc.RadioItems(
                            id="incorrect-only-toggle",
                            options=[
                                {"label": "All", "value": "all"},
                                {"label": "Incorrect Only", "value": "incorrect"},
                            ],
                            value="all",
                            inline=True,
                        ),
                    ],
                ),
                html.Div(
                    id="min-changed-control",
                    style={"display": "none"},
                    children=[
                        html.Span("Min Changed", style={"marginRight": "8px"}),
                        dcc.Input(
                            id="min-changed-stepper",
                            type="number",
                            min=1,
                            max=999,
                            value=1,
                            debounce=True,
                        ),
                    ],
                ),
            ],
        ),
        html.Div(id="matrix-panel", style=CARD_STYLE),
        html.Div(
            id="subtype-clear-wrap",
            style={"display": "none", "marginBottom": "8px"},
            children=[
                html.Button("Clear Subtype Selection", id="subtype-clear-button", n_clicks=0),
            ],
        ),
        html.Div(
            id="record-table-panel",
            style={**CARD_STYLE, "display": "none"},
        ),
    ],
)


@app.callback(
    Output("benchmark-selector", "options"),
    Output("benchmark-selector", "value"),
    Input("benchmark-selector", "id"),
)
def init_benchmarks(_):
    benchmarks = loader.get_benchmarks()
    opts = [{"label": b["name"], "value": b["id"]} for b in benchmarks]
    return opts, (opts[0]["value"] if opts else None)


@app.callback(
    Output("leaderboard-panel", "children"),
    Output("store-selected-runs", "data", allow_duplicate=True),
    Input("benchmark-selector", "value"),
    prevent_initial_call=True,
)
def render_leaderboard(benchmark_id):
    if not benchmark_id:
        return html.Div("No benchmark selected."), []
    rows = loader.get_leaderboard(int(benchmark_id))
    first = [rows[0]["run_id"]] if rows else []
    return make_leaderboard(rows), first


@app.callback(
    Output("store-matrix-cell", "data", allow_duplicate=True),
    Output("store-subtype-cell", "data", allow_duplicate=True),
    Input("store-selected-runs", "data"),
    prevent_initial_call=True,
)
def reset_drilldown_on_run_change(selected_runs):
    del selected_runs
    return None, None


@app.callback(
    Output("store-subtype-cell", "data", allow_duplicate=True),
    Input("store-matrix-cell", "data"),
    prevent_initial_call=True,
)
def reset_subtype_on_type_change(matrix_cell):
    del matrix_cell
    return None


@app.callback(
    Output("store-selected-runs", "data", allow_duplicate=True),
    Input("leaderboard-grid", "selected_rows"),
    State("leaderboard-grid", "data"),
    State("store-selected-runs", "data"),
    prevent_initial_call=True,
)
def on_leaderboard_selected(selected_rows, table_data, current_selected):
    if not table_data:
        return current_selected or []
    if not selected_rows:
        return current_selected or []
    picked = [table_data[i]["run_id"] for i in selected_rows[:2] if i < len(table_data)]
    return picked[:2]


@app.callback(
    Output("filter-toolbar", "style"),
    Output("incorrect-only-control", "style"),
    Output("min-changed-control", "style"),
    Input("store-selected-runs", "data"),
)
def render_toolbar(selected_runs):
    selected_runs = selected_runs or []
    if len(selected_runs) == 1:
        return (
            {"display": "block", "marginBottom": "12px"},
            {"display": "flex", "alignItems": "center", "gap": "8px"},
            {"display": "none"},
        )
    if len(selected_runs) == 2:
        return (
            {"display": "block", "marginBottom": "12px"},
            {"display": "none"},
            {"display": "flex", "alignItems": "center", "gap": "8px"},
        )
    return (
        {"display": "none"},
        {"display": "none"},
        {"display": "none"},
    )


@app.callback(
    Output("store-filter-mode", "data"),
    Input("incorrect-only-toggle", "value"),
    prevent_initial_call=True,
)
def update_filter_mode(value):
    return value or "all"


@app.callback(
    Output("store-correctness-filter", "data"),
    Input("store-correctness-filter-input", "value", allow_optional=True),
    prevent_initial_call=True,
)
def update_correctness_filter(value):
    return value or "all"


@app.callback(
    Output("matrix-panel", "children"),
    Input("store-selected-runs", "data"),
    Input("store-filter-mode", "data"),
    Input("min-changed-stepper", "value"),
)
def render_matrix_panel(selected_runs, filter_mode, min_changed):
    selected_runs = selected_runs or []
    if len(selected_runs) == 0:
        return html.Div(
            "Select 1 or 2 runs to view matrices",
            style={"color": COLORS["text_muted"], "padding": "16px"},
        )
    if len(selected_runs) == 1:
        return render_type_confusion_panel(int(selected_runs[0]), filter_mode or "all")

    run1 = loader.get_run(int(selected_runs[0])) or {"run_name": "Run 1"}
    run2 = loader.get_run(int(selected_runs[1])) or {"run_name": "Run 2"}
    return render_transition_panel(
        int(selected_runs[0]),
        int(selected_runs[1]),
        max(1, int(min_changed or 1)),
        run1["run_name"],
        run2["run_name"],
    )


@app.callback(
    Output("subtype-clear-wrap", "style"),
    Input("store-selected-runs", "data"),
    Input("store-matrix-cell", "data"),
)
def toggle_subtype_clear(selected_runs, matrix_cell):
    selected_runs = selected_runs or []
    if len(selected_runs) == 1 and matrix_cell:
        return {"display": "block", "marginBottom": "8px"}
    return {"display": "none", "marginBottom": "8px"}


@app.callback(
    Output("store-matrix-cell", "data"),
    Input("type-confusion-matrix", "clickData", allow_optional=True),
    State("store-matrix-cell", "data"),
    prevent_initial_call=True,
)
def on_type_cell_click(click_data, current):
    if not click_data:
        return current
    point = click_data["points"][0]
    data = {"true_type": point["customdata"][0], "pred_type": point["customdata"][1]}
    if current == data:
        return None
    return data


@app.callback(
    Output("subtype-matrix-container", "children"),
    Input("store-matrix-cell", "data"),
    Input("store-selected-runs", "data"),
    Input("store-filter-mode", "data"),
    Input("subtype-clear-button", "n_clicks"),
    prevent_initial_call=True,
)
def on_type_pair_change(cell, selected_runs, filter_mode, clear_clicks):
    del clear_clicks
    trig = callback_context.triggered[0]["prop_id"] if callback_context.triggered else ""
    if trig.startswith("subtype-clear-button"):
        return html.Div(
            "Click a cell in the Type Confusion Matrix above to view subtypes.",
            style={"padding": "12px", "color": COLORS["text_muted"]},
        )

    if not selected_runs or len(selected_runs) != 1:
        return html.Div()
    run_id = int(selected_runs[0])
    if not cell:
        return render_subtype_confusion_panel(run_id, None, None, filter_mode or "all")
    return render_subtype_confusion_panel(
        run_id,
        cell.get("true_type"),
        cell.get("pred_type"),
        filter_mode or "all",
    )


@app.callback(
    Output("store-subtype-cell", "data"),
    Input("subtype-confusion-matrix", "clickData", allow_optional=True),
    Input("misclassified-bar", "clickData", allow_optional=True),
    Input("transition-matrix", "clickData", allow_optional=True),
    prevent_initial_call=True,
)
def on_subtype_click(subtype_click, bar_click, transition_click):
    trig = callback_context.triggered[0]["prop_id"] if callback_context.triggered else ""
    if trig.startswith("subtype-confusion-matrix") and subtype_click:
        point = subtype_click["points"][0]
        return {"true_subtype": point["customdata"][0], "pred_subtype": point["customdata"][1]}
    if trig.startswith("misclassified-bar") and bar_click:
        point = bar_click["points"][0]
        subtype = point.get("y")
        return {"true_subtype": subtype, "pred_subtype": None}
    if trig.startswith("transition-matrix") and transition_click:
        point = transition_click["points"][0]
        return {
            "run1_pred_subtype": point["customdata"][0],
            "run2_pred_subtype": point["customdata"][1],
        }
    return None


@app.callback(
    Output("record-table-panel", "children"),
    Output("record-table-panel", "style"),
    Input("store-subtype-cell", "data"),
    Input("store-matrix-cell", "data"),
    Input("store-selected-runs", "data"),
    Input("store-filter-mode", "data"),
    Input("store-correctness-filter", "data"),
)
def render_record_panel(
    subtype_cell,
    matrix_cell,
    selected_runs,
    filter_mode,
    correctness_filter,
):
    selected_runs = selected_runs or []
    if not selected_runs:
        return html.Div(), {**CARD_STYLE, "display": "none"}

    if len(selected_runs) == 1:
        filters = {
            "run_id": int(selected_runs[0]),
            "incorrect_only": filter_mode == "incorrect",
            "limit": 100,
            "offset": 0,
        }
        if matrix_cell:
            filters["true_type"] = matrix_cell.get("true_type")
            filters["pred_type"] = matrix_cell.get("pred_type")
        if subtype_cell and subtype_cell.get("true_subtype"):
            filters["true_subtype"] = subtype_cell.get("true_subtype")
        if subtype_cell and subtype_cell.get("pred_subtype"):
            filters["pred_subtype"] = subtype_cell.get("pred_subtype")

        records = get_records(filters)["data"]
        title = build_record_panel_title(matrix_cell, subtype_cell)
        return make_record_table(records, show_run2=False, title=title), {**CARD_STYLE, "display": "block"}

    if len(selected_runs) == 2:
        if not subtype_cell:
            return html.Div(), {**CARD_STYLE, "display": "none"}
        filters = {
            "run_id1": int(selected_runs[0]),
            "run_id2": int(selected_runs[1]),
            "limit": 100,
            "offset": 0,
        }
        if subtype_cell.get("run1_pred_subtype"):
            filters["run1_pred_subtype"] = subtype_cell.get("run1_pred_subtype")
        if subtype_cell.get("run2_pred_subtype"):
            filters["run2_pred_subtype"] = subtype_cell.get("run2_pred_subtype")

        rows = get_records(filters)["data"]
        if correctness_filter in {"run1", "run2", "both"}:
            filtered = []
            for row in rows:
                r1_correct = row.get("pred_subtype") == row.get("true_subtype")
                r2_correct = row.get("run2_pred_subtype") == row.get("true_subtype")
                if correctness_filter == "run1" and r1_correct and not r2_correct:
                    filtered.append(row)
                elif correctness_filter == "run2" and r2_correct and not r1_correct:
                    filtered.append(row)
                elif correctness_filter == "both" and (not r1_correct and not r2_correct):
                    filtered.append(row)
            rows = filtered

        run1 = loader.get_run(int(selected_runs[0])) or {"run_name": "Run 1"}
        run2 = loader.get_run(int(selected_runs[1])) or {"run_name": "Run 2"}
        title = build_record_panel_title(None, subtype_cell)
        return make_record_table(
            rows,
            show_run2=True,
            run1_name=run1["run_name"],
            run2_name=run2["run_name"],
            title=title,
        ), {**CARD_STYLE, "display": "block"}

    return html.Div(), {**CARD_STYLE, "display": "none"}


@app.callback(
    Output("record-table", "style_data"),
    Input("row-height-24", "n_clicks"),
    Input("row-height-48", "n_clicks"),
    Input("row-height-72", "n_clicks"),
    Input("row-height-auto", "n_clicks"),
    prevent_initial_call=True,
)
def on_row_height(n1, n2, n3, na):
    del n1, n2, n3, na
    trig = callback_context.triggered[0]["prop_id"] if callback_context.triggered else ""
    if trig.startswith("row-height-48"):
        return {"height": "48px", "whiteSpace": "normal", "fontSize": FONTS["size"]["sm"]}
    if trig.startswith("row-height-72"):
        return {"height": "72px", "whiteSpace": "normal", "fontSize": FONTS["size"]["sm"]}
    if trig.startswith("row-height-auto"):
        return {"height": "auto", "whiteSpace": "normal", "fontSize": FONTS["size"]["sm"]}
    return {"height": "24px", "whiteSpace": "nowrap", "fontSize": FONTS["size"]["sm"]}


@app.callback(
    Output("copy-toast", "children"),
    Input("copy-records-json", "n_clicks"),
    prevent_initial_call=True,
)
def on_copy(n_clicks):
    if n_clicks:
        return "Copied"
    return ""


if __name__ == "__main__":
    app.run(debug=True, port=8050)
