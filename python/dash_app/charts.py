"""
Plotly figure builder functions for the Dash classification evaluation dashboard.
"""

import math
import numpy as np
import plotly.graph_objects as go


def build_heatmap_figure(
    rows: list,
    cols: list,
    matrix: dict,
    title: str = "",
    diagonal_green: bool = True,
    colorscale=None,
    row_labels: list = None,
    col_labels: list = None,
) -> go.Figure:
    """Build a Plotly heatmap figure from a matrix dict {row: {col: count}}."""
    if colorscale is None:
        colorscale = [[0, "#ffffff"], [1, "#0066cc"]]

    z = [[matrix.get(r, {}).get(c, 0) for c in cols] for r in rows]
    z_arr = np.array(z, dtype=float)

    fig = go.Figure()

    if diagonal_green and rows == cols:
        # Off-diagonal mask (blue scale)
        z_off = z_arr.copy()
        for i in range(len(rows)):
            z_off[i][i] = np.nan

        # Diagonal only
        z_diag = np.full_like(z_arr, np.nan)
        for i in range(len(rows)):
            z_diag[i][i] = z_arr[i][i]

        text_z = [[str(int(v)) if not math.isnan(v) else "" for v in row] for row in z_off.tolist()]
        text_diag = [[str(int(v)) if not math.isnan(v) else "" for v in row] for row in z_diag.tolist()]

        fig.add_trace(
            go.Heatmap(
                z=z_off.tolist(),
                x=cols,
                y=rows,
                text=text_z,
                texttemplate="%{text}",
                colorscale=colorscale,
                showscale=False,
                hovertemplate="True: %{y}<br>Pred: %{x}<br>Count: %{z}<extra></extra>",
                zmin=0,
                zmax=max(1, float(np.nanmax(z_arr))),
            )
        )
        fig.add_trace(
            go.Heatmap(
                z=z_diag.tolist(),
                x=cols,
                y=rows,
                text=text_diag,
                texttemplate="%{text}",
                colorscale=[[0, "#00aa44"], [1, "#00cc55"]],
                showscale=False,
                hovertemplate="True: %{y}<br>Pred: %{x}<br>Count: %{z}<extra></extra>",
                zmin=0,
                zmax=max(1, float(np.nanmax(z_arr))),
            )
        )
    else:
        text_z = [[str(int(v)) for v in row] for row in z]
        fig.add_trace(
            go.Heatmap(
                z=z,
                x=cols,
                y=rows,
                text=text_z,
                texttemplate="%{text}",
                colorscale=colorscale,
                showscale=False,
                hovertemplate="True: %{y}<br>Pred: %{x}<br>Count: %{z}<extra></extra>",
                zmin=0,
                zmax=max(1, float(z_arr.max())),
            )
        )

    cell_size = max(40, min(80, 600 // max(len(rows), len(cols), 1)))
    height = max(300, cell_size * len(rows) + 120)

    xaxis_extra = {}
    yaxis_extra = {}
    if col_labels is not None:
        xaxis_extra = {"tickmode": "array", "tickvals": cols, "ticktext": col_labels}
    if row_labels is not None:
        yaxis_extra = {"tickmode": "array", "tickvals": rows, "ticktext": row_labels}

    layout_title = title if title else None
    top_margin = 40 if layout_title else 10

    fig.update_layout(
        title=layout_title,
        margin=dict(l=10, r=10, t=top_margin, b=10),
        height=height,
        autosize=True,
        xaxis=dict(title="Predicted", side="bottom", tickangle=-30, **xaxis_extra),
        yaxis=dict(title="True", autorange="reversed", **yaxis_extra),
        plot_bgcolor="#f8f8f8",
    )
    return fig


def build_transition_figure(
    rows: list,
    cols: list,
    matrix: dict,
    run1_name: str,
    run2_name: str,
    title: str = None,
) -> go.Figure:
    """
    Build transition matrix heatmap styled like the confusion matrix.
    Cell text shows total count; background color encodes net delta
    (green = run2 improved, red = run2 regressed, gray = both wrong).
    """
    z_color = []
    z_text = []
    z_hover = []

    for r in rows:
        row_color = []
        row_text = []
        row_hover = []
        for c in cols:
            cell = (matrix.get(r) or {}).get(c)
            if cell is None or cell["total"] == 0:
                row_color.append(0.0)
                row_text.append("")
                row_hover.append("No transitions")
            else:
                total = cell["total"]
                r1c = cell["run1_correct"]
                r2c = cell["run2_correct"]
                bw = cell["both_wrong"]
                net = r2c - r1c
                row_text.append(str(total))
                row_color.append(float(net))
                row_hover.append(
                    f"Run1 pred: {r}<br>Run2 pred: {c}<br>"
                    f"Total: {total}<br>"
                    f"Run1 correct: {r1c}<br>"
                    f"Run2 correct: {r2c}<br>"
                    f"Both wrong: {bw}<br>"
                    f"Net delta: {net:+d}"
                )
        z_color.append(row_color)
        z_text.append(row_text)
        z_hover.append(row_hover)

    colorscale = [
        [0.0, "#cc3333"],
        [0.5, "#cccccc"],
        [1.0, "#33aa55"],
    ]

    z_arr = np.array(z_color, dtype=float)
    abs_max = max(1.0, float(np.abs(z_arr).max()))

    cell_size = max(40, min(80, 600 // max(len(rows), len(cols), 1)))
    height = max(300, cell_size * len(rows) + 120)
    width = cell_size * len(cols) + 180  # 180 for y-axis labels

    fig = go.Figure(
        go.Heatmap(
            z=z_color,
            x=cols,
            y=rows,
            text=z_text,
            customdata=z_hover,
            texttemplate="%{text}",
            colorscale=colorscale,
            zmid=0,
            zmin=-abs_max,
            zmax=abs_max,
            showscale=False,
            hovertemplate="%{customdata}<extra></extra>",
        )
    )

    default_title = f"Transition: {run1_name} -> {run2_name}"
    layout_title = default_title if title is None else (title or None)
    top_margin = 40 if layout_title else 10

    fig.update_layout(
        title=layout_title,
        margin=dict(l=10, r=10, t=top_margin, b=10),
        height=height,
        width=width,
        autosize=False,
        xaxis=dict(
            title=f"Run2 Predicted ({run2_name})",
            side="bottom",
            tickangle=-30,
        ),
        yaxis=dict(
            title=f"Run1 Predicted ({run1_name})",
            autorange="reversed",
        ),
        plot_bgcolor="#f8f8f8",
    )
    return fig
