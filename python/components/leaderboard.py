"""Leaderboard components for Dash app."""

from __future__ import annotations

import datetime as dt
import math
import re
from typing import Any

from dash import dash_table, html
from dash.dash_table.Format import Format, Scheme

from colors import COLORS, FONTS, SECTION_HEADER_STYLE


def _relative_label(target: dt.datetime) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    diff = now - target
    days = max(0, diff.days)
    if days == 0:
        return "today"
    if days == 1:
        return "1d ago"
    if days < 30:
        return f"{days}d ago"
    months = days // 30
    return f"{months}mo ago"


def parse_run_date(run_name: str, fallback: str | None = None) -> str:
    m = re.match(r"^(\d{8})", str(run_name or ""))
    if m:
        ymd = m.group(1)
        parsed = dt.datetime.strptime(ymd, "%Y%m%d").replace(tzinfo=dt.timezone.utc)
        return f"{parsed.strftime('%d/%m/%Y')} ({_relative_label(parsed)})"
    if fallback:
        try:
            parsed = dt.datetime.fromisoformat(str(fallback).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=dt.timezone.utc)
            return f"{parsed.strftime('%d/%m/%Y')} ({_relative_label(parsed)})"
        except ValueError:
            return str(fallback)
    return "-"


def _normalize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, row in enumerate(rows, start=1):
        type_f1 = row.get("type_f1_weighted")
        if type_f1 is None or (isinstance(type_f1, float) and math.isnan(type_f1)):
            type_f1 = "NaN"
        out.append(
            {
                "rank": i,
                "run_id": row.get("run_id"),
                "run_name": row.get("run_name", ""),
                "model_version": row.get("model_version", ""),
                "date_display": parse_run_date(row.get("run_name", ""), row.get("run_date")),
                "subtype_accuracy": row.get("subtype_accuracy", 0),
                "subtype_f1_weighted": row.get("subtype_f1_weighted", 0),
                "type_f1_weighted": type_f1,
                "benchmark_length": row.get("benchmark_length", 0),
            }
        )
    return out


def make_leaderboard(rows: list[dict[str, Any]]) -> html.Div:
    table_rows = _normalize_rows(rows)
    columns = [
        {"name": "#", "id": "rank", "type": "numeric"},
        {"name": "Run", "id": "run_name"},
        {"name": "Model Version", "id": "model_version"},
        {"name": "Date", "id": "date_display"},
        {"name": "Subtype Accuracy", "id": "subtype_accuracy", "type": "numeric", "format": Format(precision=4, scheme=Scheme.fixed)},
        {"name": "Subtype F1", "id": "subtype_f1_weighted", "type": "numeric", "format": Format(precision=4, scheme=Scheme.fixed)},
        {"name": "Type F1", "id": "type_f1_weighted"},
        {"name": "Benchmark Size", "id": "benchmark_length", "type": "numeric"},
    ]

    table = dash_table.DataTable(
        id="leaderboard-grid",
        columns=columns,
        data=table_rows,
        sort_action="native",
        row_selectable="multi",
        selected_rows=[],
        page_action="none",
        style_table={"overflowX": "auto", "fontFamily": FONTS["body"]},
        style_header={
            "backgroundColor": COLORS["bg_page"],
            "color": COLORS["text_secondary"],
            "fontWeight": "700",
            "fontSize": FONTS["size"]["xs"],
            "textTransform": "uppercase",
            "letterSpacing": "0.06em",
            "border": f"1px solid {COLORS['border']}",
            "padding": "8px 10px",
        },
        style_data={
            "backgroundColor": COLORS["bg_card"],
            "color": COLORS["text_primary"],
            "border": f"1px solid {COLORS['border']}",
            "fontSize": FONTS["size"]["sm"],
        },
        style_data_conditional=[
            {
                "if": {"state": "selected"},
                "backgroundColor": "#eff6ff",
                "border": f"1px solid {COLORS['accent_blue']}",
                "color": COLORS["text_primary"],
            },
            {"if": {"column_type": "numeric"}, "textAlign": "right", "fontFamily": FONTS["mono"]},
        ],
        style_cell={
            "padding": "8px 10px",
            "minWidth": "60px",
            "whiteSpace": "nowrap",
            "textOverflow": "ellipsis",
            "overflow": "hidden",
        },
    )

    return html.Div(
        [
            html.Div("Leaderboard", style=SECTION_HEADER_STYLE),
            table,
            html.Div(
                "Click a row to view its Confusion Matrix. Check up to 2 runs to compare them in the Transition Matrix.",
                style={"marginTop": "10px", "color": COLORS["text_secondary"], "fontSize": FONTS["size"]["sm"]},
            ),
        ]
    )

