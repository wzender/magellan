# Better Confusion Matrix in Dash (Without go.Heatmap)

## The Problem with `go.Heatmap`

`go.Heatmap` gives you limited control over:
- Cell-level interactivity (click a cell → drill down)
- Custom annotations and styling per cell
- Hover templates that feel polished
- Diagonal highlighting for correct predictions

---

## Recommended Approach: `go.Figure` with `go.Scatter` Tiles + Shapes

Instead of a heatmap, build the matrix manually using **rectangles as shapes** and **scatter traces for text/interaction**. This gives you full control over every cell.

### Why this works better:
- Full CSS-like control over each cell's color, border, text
- Native click events per cell (`clickData` callback)
- Diagonal cells (correct predictions) can be styled differently
- Smooth color scaling without Plotly's heatmap quirks

---

## Implementation Pattern

### 1. Core Figure Builder

```python
import plotly.graph_objects as go
import numpy as np

def build_confusion_matrix_figure(matrix: np.ndarray, labels: list[str]) -> go.Figure:
    n = len(labels)
    fig = go.Figure()

    # Normalize for color intensity (row-wise)
    row_sums = matrix.sum(axis=1, keepdims=True)
    norm_matrix = np.divide(matrix, row_sums, where=row_sums != 0)

    shapes = []
    annotations = []

    for i in range(n):       # true label (row)
        for j in range(n):   # predicted label (col)
            value = matrix[i][j]
            norm_val = norm_matrix[i][j]

            # Color: green diagonal, blue off-diagonal, white for zero
            if value == 0:
                fill_color = "rgba(245,245,245,1)"
                font_color = "#ccc"
            elif i == j:
                # Correct prediction — use a teal/green scale
                intensity = int(60 + norm_val * 180)
                fill_color = f"rgba(32, {intensity + 60}, {intensity}, 0.85)"
                font_color = "white" if norm_val > 0.4 else "#1a3a2a"
            else:
                # Misclassification — use a warm red scale
                intensity = int(norm_val * 220)
                fill_color = f"rgba({200 + intensity // 4}, {80 - intensity // 8}, 60, {0.3 + norm_val * 0.7})"
                font_color = "white" if norm_val > 0.3 else "#5a1010"

            # Draw rectangle shape for the cell
            shapes.append(dict(
                type="rect",
                x0=j - 0.5, x1=j + 0.5,
                y0=i - 0.5, y1=i + 0.5,
                fillcolor=fill_color,
                line=dict(color="white", width=1.5),
                layer="below"
            ))

            # Add value annotation
            if value > 0:
                annotations.append(dict(
                    x=j, y=i,
                    text=str(value),
                    showarrow=False,
                    font=dict(size=11, color=font_color, family="JetBrains Mono, monospace"),
                    xref="x", yref="y"
                ))

    # Invisible scatter trace — this is what captures click events
    fig.add_trace(go.Scatter(
        x=[j for i in range(n) for j in range(n)],
        y=[i for i in range(n) for j in range(n)],
        mode="markers",
        marker=dict(size=28, opacity=0, color="rgba(0,0,0,0)"),
        customdata=[(labels[i], labels[j], int(matrix[i][j]))
                    for i in range(n) for j in range(n)],
        hovertemplate=(
            "<b>True:</b> %{customdata[0]}<br>"
            "<b>Predicted:</b> %{customdata[1]}<br>"
            "<b>Count:</b> %{customdata[2]}<extra></extra>"
        ),
        showlegend=False
    ))

    fig.update_layout(
        shapes=shapes,
        annotations=annotations,
        xaxis=dict(
            tickvals=list(range(n)),
            ticktext=labels,
            tickangle=-45,
            side="top",
            showgrid=False,
            zeroline=False,
        ),
        yaxis=dict(
            tickvals=list(range(n)),
            ticktext=labels,
            autorange="reversed",   # top-left = (0,0)
            showgrid=False,
            zeroline=False,
        ),
        plot_bgcolor="white",
        paper_bgcolor="white",
        margin=dict(l=120, r=20, t=120, b=20),
        height=600,
        font=dict(family="Inter, sans-serif", size=12),
        hoverlabel=dict(
            bgcolor="#1e1e2e",
            font=dict(color="white", size=12)
        )
    )

    return fig
```

---

### 2. Dash Layout Snippet

```python
import dash
from dash import dcc, html, Input, Output, callback

app = dash.Dash(__name__)

app.layout = html.Div([
    html.H2("Type Confusion Matrix", style={"fontFamily": "Inter", "color": "#1e1e2e"}),

    dcc.Graph(
        id="confusion-matrix",
        figure=build_confusion_matrix_figure(your_matrix, your_labels),
        config={"displayModeBar": False},
        style={"borderRadius": "12px", "boxShadow": "0 4px 24px rgba(0,0,0,0.08)"}
    ),

    html.Div(id="subtype-panel", style={"marginTop": "24px"})
])


@callback(
    Output("subtype-panel", "children"),
    Input("confusion-matrix", "clickData")
)
def show_subtype_matrix(click_data):
    if click_data is None:
        return html.P("Click a cell to drill into subtypes.", style={"color": "#aaa"})

    point = click_data["points"][0]
    true_label, pred_label, count = point["customdata"]

    # Load and display subtype confusion matrix for this cell
    sub_matrix, sub_labels = get_subtype_matrix(true_label, pred_label)

    return dcc.Graph(
        figure=build_confusion_matrix_figure(sub_matrix, sub_labels),
        config={"displayModeBar": False}
    )
```

---

### 3. F1 Score Row (above the matrix)

Add a bar of colored F1 badges per column using `go.Bar` overlaid with the matrix, or simpler — use Dash's `html` components:

```python
def f1_badge_row(labels, f1_scores):
    return html.Div([
        html.Div(
            f"{score:.0%}",
            style={
                "display": "inline-block",
                "width": "60px",
                "textAlign": "center",
                "fontSize": "11px",
                "fontWeight": "600",
                "color": "#fff" if score > 0.7 else "#333",
                "background": f"hsl({int(score * 120)}, 65%, 45%)",
                "borderRadius": "4px",
                "padding": "2px 4px",
                "margin": "0 2px"
            }
        )
        for label, score in zip(labels, f1_scores)
    ], style={"marginBottom": "8px", "paddingLeft": "120px"})
```

---

## Styling Tips

| What | How |
|---|---|
| Card container | `borderRadius: 12px`, `boxShadow: 0 4px 24px rgba(0,0,0,0.08)` |
| Font | Use system fonts like `"Consolas, monospace"` for numbers, `"Segoe UI, sans-serif"` for labels (no CDN needed) |
| Diagonal cells | Teal/green scale (`hsl(160, 60%, X%)`) |
| Error cells | Warm red scale (`hsl(0, 65%, X%)`) |
| Zero cells | Near-white `#f5f5f5` — visually quiet |
| Hover | Dark tooltip (`#1e1e2e` bg, white text) |

> **Air-gapped tip:** Avoid `external_stylesheets` pointing to Google Fonts or any CDN. Use system fonts instead — they look clean and require zero network calls.

---

## Air-Gapped Environment Note

This guide is fully compatible with offline/air-gapped machines. All approaches here rely only on:
- `dash` 
- `plotly`
- `numpy`

No CDN, no external JS, no internet connection required at runtime.

If you need to install dependencies on the air-gapped machine, pre-download the wheels on a connected machine and transfer them:

```bash
# On a connected machine:
pip download dash plotly numpy -d ./packages

# Transfer ./packages folder, then on air-gapped machine:
pip install --no-index --find-links ./packages dash plotly numpy
```

---

## Summary

| Approach | Interactivity | Visual Control | Click-to-drilldown | Works Offline |
|---|---|---|---|---|
| `go.Heatmap` | Limited | Low | Hard | ✅ |
| `go.Scatter` + Shapes | ✅ Full | ✅ Full | ✅ Easy | ✅ |

The `go.Scatter` + shapes approach keeps you fully inside Plotly/Dash — no React needed, no internet needed — while giving you the visual quality and interactivity of the React version.
