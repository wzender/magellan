"""Record table renderer for single-run and transition drill-down."""

from __future__ import annotations

import json
from typing import Any

from dash import dash_table, dcc, html

from colors import COLORS, FONTS, SECTION_HEADER_STYLE


def _short_json(val: Any) -> tuple[str, str]:
    if isinstance(val, dict) and not val:
        return "(empty)", "{}"
    try:
        text = json.dumps(val, ensure_ascii=True, sort_keys=True)
    except TypeError:
        text = str(val)
    short = text if len(text) <= 80 else f"{text[:77]}..."
    return short, text


def make_record_table(
    rows: list[dict[str, Any]],
    show_run2: bool = False,
    run1_name: str = "Run 1",
    run2_name: str = "Run 2",
    title: str = "Records",
) -> html.Div:
    cooked = []
    tooltips = []
    for row in rows:
        attrs_short, attrs_full = _short_json(row.get("attributes", {}))
        meta_short, meta_full = _short_json(row.get("metadata", {}))
        # DataTable row values must be primitive types.
        out = {
            "record_id": row.get("record_id", ""),
            "true_type": row.get("true_type", ""),
            "pred_type": row.get("pred_type", ""),
            "true_subtype": row.get("true_subtype", ""),
            "pred_subtype": row.get("pred_subtype", ""),
            "run2_pred_type": row.get("run2_pred_type", ""),
            "run2_pred_subtype": row.get("run2_pred_subtype", ""),
        }
        out["attributes_short"] = attrs_short
        out["metadata_short"] = meta_short
        out["_r1_correct"] = row.get("pred_subtype") == row.get("true_subtype")
        out["_r2_correct"] = row.get("run2_pred_subtype") == row.get("true_subtype") if show_run2 else True
        if show_run2:
            r1_dot = "●" if out["_r1_correct"] else "○"
            r2_dot = "●" if out["_r2_correct"] else "○"
            out["record_id"] = f"{r1_dot}{r2_dot} {row.get('record_id', '')}"
        else:
            r1_dot = "●" if out["_r1_correct"] else "○"
            out["record_id"] = f"{r1_dot} {row.get('record_id', '')}"
        cooked.append(out)
        tooltips.append(
            {
                "attributes_short": {"value": attrs_full, "type": "markdown"},
                "metadata_short": {"value": meta_full, "type": "markdown"},
            }
        )

    columns = [
        {"name": "record_id", "id": "record_id"},
        {"name": "true_type", "id": "true_type"},
        {"name": "pred_type", "id": "pred_type"},
        {"name": "true_subtype", "id": "true_subtype"},
        {"name": "pred_subtype", "id": "pred_subtype"},
    ]
    if show_run2:
        columns.extend(
            [
                {"name": (run2_name, "pred_type"), "id": "run2_pred_type"},
                {"name": (run2_name, "pred_subtype"), "id": "run2_pred_subtype"},
            ]
        )
    columns.extend([
        {"name": "attributes", "id": "attributes_short"},
        {"name": "metadata", "id": "metadata_short"},
    ])

    table = dash_table.DataTable(
        id="record-table",
        columns=columns,
        data=cooked,
        tooltip_data=tooltips,
        merge_duplicate_headers=True,
        sort_action="native",
        filter_action="native",
        page_action="native",
        page_size=20,
        style_table={"overflowX": "auto"},
        style_header={"fontWeight": "700", "fontSize": FONTS["size"]["xs"], "textTransform": "uppercase"},
        style_data={"fontSize": FONTS["size"]["sm"], "whiteSpace": "nowrap", "height": "24px"},
        style_data_conditional=[
            {
                "if": {
                    "filter_query": "{pred_subtype} != {true_subtype}",
                },
                "backgroundColor": "#fff1f2",
            },
            {
                "if": {
                    "column_id": "record_id",
                    "filter_query": "{_r1_correct} = true",
                },
                "color": "#16a34a",
                "fontFamily": FONTS["mono"],
            },
            {
                "if": {
                    "column_id": "record_id",
                    "filter_query": "{_r1_correct} = false",
                },
                "color": "#dc2626",
                "fontFamily": FONTS["mono"],
            },
            {"if": {"column_id": "attributes_short"}, "fontFamily": FONTS["mono"]},
            {"if": {"column_id": "metadata_short"}, "fontFamily": FONTS["mono"]},
        ],
    )

    return html.Div(
        [
            html.Div(title, style=SECTION_HEADER_STYLE),
            html.Div(
                [
                    html.Button("1-line", id="row-height-24", n_clicks=0),
                    html.Button("2-line", id="row-height-48", n_clicks=0),
                    html.Button("3-line", id="row-height-72", n_clicks=0),
                    html.Button("Auto", id="row-height-auto", n_clicks=0),
                    dcc.Clipboard(id="copy-records-json", content=json.dumps(cooked, ensure_ascii=True), title="Copy JSON"),
                    html.Div(id="copy-toast", className="copy-toast"),
                ],
                style={"display": "flex", "gap": "8px", "marginBottom": "8px", "alignItems": "center"},
            ),
            table,
        ]
    )

