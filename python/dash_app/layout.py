"""
Layout for the Dash classification evaluation dashboard.
"""

from dash import dcc, html, dash_table
import dash_bootstrap_components as dbc

from .data import get_benchmarks

_CELL_STYLE = {
    "textAlign": "left",
    "verticalAlign": "top",
    "whiteSpace": "pre-wrap",
    "minWidth": "80px",
}

_MATRIX_SCROLL_STYLE = {
    "maxHeight": "70vh",
    "overflow": "auto",
    "border": "1px solid #dee2e6",
    "borderRadius": "6px",
    "backgroundColor": "#ffffff",
    "padding": "0.5rem 0.5rem 0.25rem 0.5rem",
    "marginBottom": "0.5rem",
}

_MATRIX_STICKY_TITLE_STYLE = {
    "position": "sticky",
    "top": 0,
    "zIndex": 10,
    "backgroundColor": "#ffffff",
    "margin": "0 0 0.5rem 0",
    "padding": "0.35rem 0.25rem",
    "borderBottom": "1px solid #e9ecef",
}


def create_layout():
    benchmarks = get_benchmarks()
    benchmark_options = [{"label": b["name"], "value": b["id"]} for b in benchmarks]
    default_benchmark = benchmarks[0]["id"] if benchmarks else None

    return dbc.Container(
        fluid=True,
        style={"padding": "0 24px"},
        children=[
            # ── Stores ────────────────────────────────────────────────────────
            dcc.Store(id="store-run-ids", data=[]),
            dcc.Store(id="store-type-pair", data=None),
            dcc.Store(id="store-cell", data=None),
            dcc.Store(id="store-transition-cell", data=None),

            # ── Header ────────────────────────────────────────────────────────
            dbc.Row(
                align="center",
                className="py-2 border-bottom mb-2",
                children=[
                    dbc.Col(
                        html.H4(
                            "Classification Evaluation Dashboard",
                            className="mb-0",
                        ),
                        width="auto",
                    ),
                    dbc.Col(width=True),  # spacer
                    dbc.Col(
                        dcc.Dropdown(
                            id="benchmark-dropdown",
                            options=benchmark_options,
                            value=default_benchmark,
                            clearable=False,
                            style={"minWidth": "220px"},
                        ),
                        width="auto",
                    ),
                ],
            ),

            # ── Toolbar ───────────────────────────────────────────────────────
            dbc.Row(
                align="center",
                className="mb-2",
                children=[
                    dbc.Col(
                        dbc.Switch(
                            id="incorrect-only-switch",
                            label="Incorrect Only",
                            value=False,
                            disabled=True,
                            className="mb-0",
                        ),
                        width="auto",
                    ),
                    dbc.Col(
                        dbc.InputGroup(
                            [
                                dbc.InputGroupText("Min transitions"),
                                dbc.Input(
                                    id="min-count-input",
                                    type="number",
                                    value=1,
                                    min=1,
                                    style={"width": "70px"},
                                ),
                            ],
                            size="sm",
                        ),
                        width="auto",
                    ),
                ],
            ),

            # ── Leaderboard ───────────────────────────────────────────────────
            html.H5("Leaderboard", className="mb-1"),
            dash_table.DataTable(
                id="leaderboard-table",
                row_selectable="multi",
                page_size=20,
                style_table={"overflowX": "auto"},
                style_cell={"textAlign": "left", "padding": "6px 10px"},
                style_header={
                    "fontWeight": "bold",
                    "backgroundColor": "#f8f9fa",
                },
                style_data_conditional=[
                    {
                        "if": {"state": "selected"},
                        "backgroundColor": "#cce5ff",
                        "border": "1px solid #004085",
                    }
                ],
            ),
            html.Small(
                "Select 1 run → confusion matrix | Select 2 runs → transition matrix",
                className="text-muted",
            ),

            html.Hr(),

            # ── No-selection message ──────────────────────────────────────────
            html.Div(
                "Select one or two runs to begin analysis.",
                id="no-selection-msg",
                className="text-muted",
            ),

            # ── Confusion panel ───────────────────────────────────────────────
            html.Div(
                id="confusion-panel",
                style={"display": "none"},
                children=[
                    html.Div(
                        style=_MATRIX_SCROLL_STYLE,
                        children=[
                            html.H5(id="type-matrix-title", style=_MATRIX_STICKY_TITLE_STYLE),
                            dcc.Loading(
                                dcc.Graph(
                                    id="type-matrix-graph",
                                    config={"displayModeBar": False},
                                )
                            ),
                        ],
                    ),
                    html.Div(id="type-pair-info", className="text-muted small"),
                    html.Button(
                        "Clear",
                        id="clear-type-btn",
                        className="btn btn-sm btn-outline-secondary mb-2",
                        style={"display": "none"},
                    ),
                    html.Hr(),
                    html.Div(
                        id="subtype-panel",
                        style={"display": "none"},
                        children=[
                            html.Div(
                                style=_MATRIX_SCROLL_STYLE,
                                children=[
                                    html.H5(
                                        id="subtype-matrix-title",
                                        style=_MATRIX_STICKY_TITLE_STYLE,
                                    ),
                                    dcc.Loading(
                                        dcc.Graph(
                                            id="subtype-matrix-graph",
                                            config={"displayModeBar": False},
                                        )
                                    ),
                                ],
                            ),
                            html.Div(id="cell-info", className="text-muted small"),
                            html.Button(
                                "Clear",
                                id="clear-cell-btn",
                                className="btn btn-sm btn-outline-secondary mb-2",
                                style={"display": "none"},
                            ),
                        ],
                    ),
                    html.Hr(),
                    html.H5("Records"),
                    html.Div(id="records-count", className="text-muted small mb-1"),
                    dash_table.DataTable(
                        id="records-table",
                        page_size=25,
                        style_table={"overflowX": "auto"},
                        style_cell=_CELL_STYLE,
                    ),
                ],
            ),

            # ── Transition panel ──────────────────────────────────────────────
            html.Div(
                id="transition-panel",
                style={"display": "none"},
                children=[
                    html.Div(id="transition-info", className="text-muted small mb-2"),
                    html.Div(id="transition-metrics", className="mb-3"),
                    html.Div(
                        style=_MATRIX_SCROLL_STYLE,
                        children=[
                            html.H5(
                                id="transition-matrix-title",
                                style=_MATRIX_STICKY_TITLE_STYLE,
                            ),
                            dcc.Loading(
                                dcc.Graph(
                                    id="transition-matrix-graph",
                                    config={"displayModeBar": False},
                                )
                            ),
                        ],
                    ),
                    html.Div(
                        id="transition-cell-info",
                        className="text-muted small",
                    ),
                    html.Button(
                        "Clear",
                        id="clear-transition-btn",
                        className="btn btn-sm btn-outline-secondary mb-2",
                        style={"display": "none"},
                    ),
                    html.Hr(),
                    html.H5("Records"),
                    html.Div(
                        id="transition-records-count",
                        className="text-muted small mb-1",
                    ),
                    dash_table.DataTable(
                        id="transition-records-table",
                        page_size=25,
                        style_table={"overflowX": "auto"},
                        style_cell=_CELL_STYLE,
                    ),
                ],
            ),
        ],
    )
