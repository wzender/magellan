"""
All Dash callbacks for the classification evaluation dashboard.
"""

import json

from dash import Input, Output, State, ctx, no_update, callback
import dash_bootstrap_components as dbc
from dash import html

from .app import app
from .data import (
    get_leaderboard,
    get_confusion_matrix,
    get_subtype_matrix,
    get_transition_matrix,
    get_records,
    get_run_name,
)
from .charts import build_heatmap_figure, build_transition_figure


# ── Helper ─────────────────────────────────────────────────────────────────────

def _format_json_md(obj) -> str:
    """Format a dict as markdown bullet list: **key**: value."""
    if not obj:
        return ""
    if isinstance(obj, str):
        try:
            obj = json.loads(obj)
        except (json.JSONDecodeError, ValueError):
            return obj
    if not isinstance(obj, dict):
        return str(obj)
    lines = []
    for k, v in obj.items():
        v_str = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
        lines.append(f"**{k}**: {v_str}")
    return "  \n".join(lines)


# ── Callback 1: update_leaderboard ────────────────────────────────────────────

@app.callback(
    Output("leaderboard-table", "data"),
    Output("leaderboard-table", "columns"),
    Output("leaderboard-table", "selected_rows"),
    Input("benchmark-dropdown", "value"),
)
def update_leaderboard(benchmark_id):
    if benchmark_id is None:
        return [], [], []

    rows = get_leaderboard(int(benchmark_id))

    data = [
        {
            "run_id": r["run_id"],
            "run_name": r["run_name"],
            "model_version": r["model_version"],
            "subtype_accuracy": f"{r['subtype_accuracy']:.4f}",
            "subtype_f1_weighted": f"{r['subtype_f1_weighted']:.4f}",
            "benchmark_length": r["benchmark_length"],
        }
        for r in rows
    ]

    columns = [
        {"name": "Run Name", "id": "run_name"},
        {"name": "Model Version", "id": "model_version"},
        {"name": "Subtype Accuracy", "id": "subtype_accuracy"},
        {"name": "Subtype F1 Weighted", "id": "subtype_f1_weighted"},
        {"name": "Benchmark Length", "id": "benchmark_length"},
    ]

    return data, columns, []


# ── Callback 2: update_run_ids ─────────────────────────────────────────────────

@app.callback(
    Output("store-run-ids", "data"),
    Input("leaderboard-table", "selected_rows"),
    State("leaderboard-table", "data"),
    prevent_initial_call=True,
)
def update_run_ids(selected_rows, table_data):
    if not selected_rows or not table_data:
        return []
    # Enforce max 2 rows
    limited = selected_rows[:2]
    return [table_data[i]["run_id"] for i in limited]


# ── Callback 3: toggle_panels ──────────────────────────────────────────────────

@app.callback(
    Output("confusion-panel", "style"),
    Output("transition-panel", "style"),
    Output("no-selection-msg", "style"),
    Output("incorrect-only-switch", "disabled"),
    Input("store-run-ids", "data"),
)
def toggle_panels(run_ids):
    run_ids = run_ids or []
    n = len(run_ids)

    if n == 0:
        return (
            {"display": "none"},
            {"display": "none"},
            {"display": "block"},
            True,
        )
    elif n == 1:
        return (
            {"display": "block"},
            {"display": "none"},
            {"display": "none"},
            False,
        )
    else:  # n == 2
        return (
            {"display": "none"},
            {"display": "block"},
            {"display": "none"},
            True,
        )


# ── Callback 4: update_type_matrix ────────────────────────────────────────────

@app.callback(
    Output("type-matrix-graph", "figure"),
    Output("type-matrix-title", "children"),
    Input("store-run-ids", "data"),
    Input("incorrect-only-switch", "value"),
)
def update_type_matrix(run_ids, incorrect_only):
    run_ids = run_ids or []
    if len(run_ids) != 1:
        return {}, ""

    run_id = run_ids[0]
    incorrect_only = bool(incorrect_only)
    run_name = get_run_name(run_id)

    cm_data = get_confusion_matrix(run_id, incorrect_only=incorrect_only)
    type_info = cm_data["type_matrix"]
    type_f1 = cm_data.get("type_f1", {})
    type_title = f"Type Confusion Matrix - {run_name}"

    if not type_info["rows"]:
        return {}, type_title

    # Sort types by F1 ascending (worst first) so problem types are prominent
    sorted_types = sorted(type_info["rows"], key=lambda t: type_f1.get(t, 0.0))
    labels = [f"{t} ({type_f1.get(t, 0.0):.2f})" for t in sorted_types]

    fig = build_heatmap_figure(
        rows=sorted_types,
        cols=sorted_types,
        matrix=type_info["data"],
        title="",
        diagonal_green=True,
        row_labels=labels,
        col_labels=labels,
    )
    return fig, type_title


# ── Callback 5: update_type_pair ──────────────────────────────────────────────

@app.callback(
    Output("store-type-pair", "data"),
    Input("type-matrix-graph", "clickData"),
    Input("clear-type-btn", "n_clicks"),
    Input("store-run-ids", "data"),
    prevent_initial_call=True,
)
def update_type_pair(click_data, clear_clicks, run_ids):
    triggered = ctx.triggered_id

    if triggered in ("clear-type-btn", "store-run-ids"):
        return None

    if triggered == "type-matrix-graph" and click_data:
        pt = click_data["points"][0]
        return {"true_type": pt["y"], "pred_type": pt["x"]}

    return None


# ── Callback 6: update_type_pair_display ──────────────────────────────────────

@app.callback(
    Output("type-pair-info", "children"),
    Output("clear-type-btn", "style"),
    Input("store-type-pair", "data"),
)
def update_type_pair_display(type_pair):
    if not type_pair:
        return "", {"display": "none"}
    text = f"Selected: True={type_pair['true_type']} → Pred={type_pair['pred_type']}"
    return text, {"display": "inline-block"}


# ── Callback 7: update_subtype_panel ──────────────────────────────────────────

@app.callback(
    Output("subtype-matrix-graph", "figure"),
    Output("subtype-panel", "style"),
    Output("subtype-matrix-title", "children"),
    Input("store-type-pair", "data"),
    Input("incorrect-only-switch", "value"),
    State("store-run-ids", "data"),
)
def update_subtype_panel(type_pair, incorrect_only, run_ids):
    run_ids = run_ids or []
    if not type_pair or len(run_ids) != 1:
        return {}, {"display": "none"}, ""

    run_id = run_ids[0]
    incorrect_only = bool(incorrect_only)

    sub_info = get_subtype_matrix(
        run_id,
        type_pair["true_type"],
        type_pair["pred_type"],
        incorrect_only=incorrect_only,
    )

    if not sub_info["rows"]:
        return {}, {"display": "none"}, ""

    subtype_title = f"Subtype: {type_pair['true_type']} -> {type_pair['pred_type']}"

    fig = build_heatmap_figure(
        rows=sub_info["rows"],
        cols=sub_info["cols"],
        matrix=sub_info["data"],
        title="",
        diagonal_green=True,
    )
    return fig, {"display": "block"}, subtype_title


# ── Callback 8: update_cell ───────────────────────────────────────────────────

@app.callback(
    Output("store-cell", "data"),
    Input("subtype-matrix-graph", "clickData"),
    Input("clear-cell-btn", "n_clicks"),
    Input("store-type-pair", "data"),
    prevent_initial_call=True,
)
def update_cell(click_data, clear_clicks, type_pair):
    triggered = ctx.triggered_id

    if triggered in ("clear-cell-btn", "store-type-pair"):
        return None

    if triggered == "subtype-matrix-graph" and click_data:
        pt = click_data["points"][0]
        return {"true_subtype": pt["y"], "pred_subtype": pt["x"]}

    return None


# ── Callback 9: update_cell_display ───────────────────────────────────────────

@app.callback(
    Output("cell-info", "children"),
    Output("clear-cell-btn", "style"),
    Input("store-cell", "data"),
)
def update_cell_display(cell):
    if not cell:
        return "", {"display": "none"}
    text = f"Selected: True={cell['true_subtype']} → Pred={cell['pred_subtype']}"
    return text, {"display": "inline-block"}


# ── Callback 10: update_records ───────────────────────────────────────────────

@app.callback(
    Output("records-table", "data"),
    Output("records-table", "columns"),
    Output("records-count", "children"),
    Input("store-cell", "data"),
    Input("store-type-pair", "data"),
    Input("incorrect-only-switch", "value"),
    State("store-run-ids", "data"),
)
def update_records(cell, type_pair, incorrect_only, run_ids):
    run_ids = run_ids or []
    if len(run_ids) != 1:
        return [], [], ""

    run_id = run_ids[0]
    incorrect_only = bool(incorrect_only)

    filters = {"run_id": run_id, "incorrect_only": incorrect_only}

    if cell and type_pair:
        filters["true_subtype"] = cell["true_subtype"]
        filters["pred_subtype"] = cell["pred_subtype"]
        filters["true_type"] = type_pair["true_type"]
        filters["pred_type"] = type_pair["pred_type"]
    elif cell:
        filters["true_subtype"] = cell["true_subtype"]
        filters["pred_subtype"] = cell["pred_subtype"]
    elif type_pair:
        filters["true_type"] = type_pair["true_type"]
        filters["pred_type"] = type_pair["pred_type"]

    result = get_records(filters)
    records = result["data"]
    total = result["total"]

    plain_cols = ["record_id", "true_type", "pred_type", "true_subtype", "pred_subtype"]
    columns = [{"name": c.replace("_", " ").title(), "id": c} for c in plain_cols]
    columns += [
        {"name": "Attributes", "id": "attributes", "presentation": "markdown"},
        {"name": "Metadata", "id": "metadata", "presentation": "markdown"},
    ]

    data = [
        {
            "record_id": r["record_id"],
            "true_type": r["true_type"],
            "pred_type": r["pred_type"],
            "true_subtype": r["true_subtype"],
            "pred_subtype": r["pred_subtype"],
            "attributes": _format_json_md(r.get("attributes", {})),
            "metadata": _format_json_md(r.get("metadata", {})),
        }
        for r in records
    ]

    count_text = f"Showing {len(records)} of {total} records"
    return data, columns, count_text


# ── Callback 11: update_transition_matrix ─────────────────────────────────────

@app.callback(
    Output("transition-matrix-graph", "figure"),
    Output("transition-matrix-title", "children"),
    Output("transition-metrics", "children"),
    Output("transition-info", "children"),
    Input("store-run-ids", "data"),
    Input("min-count-input", "value"),
)
def update_transition_matrix(run_ids, min_count):
    run_ids = run_ids or []
    if len(run_ids) != 2:
        return {}, "", "", ""

    run_id1, run_id2 = run_ids[0], run_ids[1]
    run_name1 = get_run_name(run_id1)
    run_name2 = get_run_name(run_id2)
    transition_title = f"Transition Matrix - {run_name1} -> {run_name2}"

    min_count_val = int(min_count) if min_count else 1

    tm_data = get_transition_matrix(run_id1, run_id2, min_count=min_count_val)

    info_text = html.P(
        f"Transition mode: comparing {run_name1} vs {run_name2}. "
        "Only records where predictions differ are shown.",
        className="text-info",
    )

    if not tm_data["rows"]:
        return (
            {},
            transition_title,
            html.P(
                "No transitions found with the current min-count filter.",
                className="text-warning",
            ),
            info_text,
        )

    # Compute aggregate metrics
    total_r1c = 0
    total_r2c = 0
    total_bw = 0
    for r in tm_data["rows"]:
        for c in tm_data["cols"]:
            cell = (tm_data["data"].get(r) or {}).get(c)
            if cell:
                total_r1c += cell["run1_correct"]
                total_r2c += cell["run2_correct"]
                total_bw += cell["both_wrong"]

    net_delta = total_r2c - total_r1c

    metrics = dbc.Row(
        [
            dbc.Col(
                dbc.Card(
                    dbc.CardBody([
                        html.H6("Run1 correct → Run2 wrong", className="card-subtitle text-muted mb-1"),
                        html.H4(str(total_r1c), className="card-title"),
                    ]),
                    className="mb-3",
                )
            ),
            dbc.Col(
                dbc.Card(
                    dbc.CardBody([
                        html.H6("Run1 wrong → Run2 correct", className="card-subtitle text-muted mb-1"),
                        html.H4(str(total_r2c), className="card-title"),
                    ]),
                    className="mb-3",
                )
            ),
            dbc.Col(
                dbc.Card(
                    dbc.CardBody([
                        html.H6("Net delta (Run2 - Run1)", className="card-subtitle text-muted mb-1"),
                        html.H4(
                            f"{net_delta:+d}",
                            className="card-title text-success" if net_delta >= 0 else "card-title text-danger",
                        ),
                    ]),
                    className="mb-3",
                )
            ),
        ]
    )

    fig = build_transition_figure(
        rows=tm_data["rows"],
        cols=tm_data["cols"],
        matrix=tm_data["data"],
        run1_name=run_name1,
        run2_name=run_name2,
        title="",
    )

    return fig, transition_title, metrics, info_text


# ── Callback 12: update_transition_cell ───────────────────────────────────────

@app.callback(
    Output("store-transition-cell", "data"),
    Input("transition-matrix-graph", "clickData"),
    Input("clear-transition-btn", "n_clicks"),
    Input("store-run-ids", "data"),
    prevent_initial_call=True,
)
def update_transition_cell(click_data, clear_clicks, run_ids):
    triggered = ctx.triggered_id

    if triggered in ("clear-transition-btn", "store-run-ids"):
        return None

    if triggered == "transition-matrix-graph" and click_data:
        pt = click_data["points"][0]
        return {"run1_pred": pt["y"], "run2_pred": pt["x"]}

    return None


# ── Callback 13: update_transition_cell_display ───────────────────────────────

@app.callback(
    Output("transition-cell-info", "children"),
    Output("clear-transition-btn", "style"),
    Input("store-transition-cell", "data"),
)
def update_transition_cell_display(cell):
    if not cell:
        return "", {"display": "none"}
    text = f"Selected transition: Run1 pred={cell['run1_pred']} → Run2 pred={cell['run2_pred']}"
    return text, {"display": "inline-block"}


# ── Callback 14: update_transition_records ────────────────────────────────────

@app.callback(
    Output("transition-records-table", "data"),
    Output("transition-records-table", "columns"),
    Output("transition-records-count", "children"),
    Input("store-transition-cell", "data"),
    State("store-run-ids", "data"),
    prevent_initial_call=True,
)
def update_transition_records(cell, run_ids):
    run_ids = run_ids or []
    if len(run_ids) != 2:
        return [], [], ""

    run_id1, run_id2 = run_ids[0], run_ids[1]

    filters = {"run_id1": run_id1, "run_id2": run_id2}

    if cell:
        filters["run1_pred_subtype"] = cell["run1_pred"]
        filters["run2_pred_subtype"] = cell["run2_pred"]

    result = get_records(filters)
    records = result["data"]
    total = result["total"]

    plain_cols = [
        "record_id", "true_type", "pred_type", "true_subtype", "pred_subtype",
        "run2_pred_type", "run2_pred_subtype",
    ]
    columns = [{"name": c.replace("_", " ").title(), "id": c} for c in plain_cols]
    columns += [
        {"name": "Attributes", "id": "attributes", "presentation": "markdown"},
        {"name": "Metadata", "id": "metadata", "presentation": "markdown"},
    ]

    data = [
        {
            "record_id": r["record_id"],
            "true_type": r["true_type"],
            "pred_type": r["pred_type"],
            "true_subtype": r["true_subtype"],
            "pred_subtype": r["pred_subtype"],
            "run2_pred_type": r.get("run2_pred_type", ""),
            "run2_pred_subtype": r.get("run2_pred_subtype", ""),
            "attributes": _format_json_md(r.get("attributes", {})),
            "metadata": _format_json_md(r.get("metadata", {})),
        }
        for r in records
    ]

    count_text = f"Showing {len(records)} of {total} records (where predictions differ)"
    return data, columns, count_text
