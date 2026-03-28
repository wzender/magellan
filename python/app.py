"""
Classification Evaluation Dashboard — Streamlit app.
Run from project root: streamlit run python/app.py
"""

import json
import math
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from data_loader import (
    get_benchmarks,
    get_leaderboard,
    get_confusion_matrix,
    get_subtype_matrix,
    get_transition_matrix,
    get_records,
)

# ── Page config ───────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Classification Evaluation Dashboard",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Session-state initialisation ──────────────────────────────────────────────

def init_state():
    defaults = {
        "selected_benchmark_id": None,
        "selected_run_ids": [],
        "selected_type_pair": None,   # {"true_type": ..., "pred_type": ...}
        "selected_cell": None,        # {"true_subtype": ..., "pred_subtype": ...}
        "selected_transition_cell": None,  # {"run1_pred": ..., "run2_pred": ...}
        "incorrect_only": False,
    }
    for key, val in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = val

init_state()

# ── Helpers ───────────────────────────────────────────────────────────────────

def reset_cells():
    st.session_state.selected_type_pair = None
    st.session_state.selected_cell = None
    st.session_state.selected_transition_cell = None


def build_heatmap_figure(
    rows: list[str],
    cols: list[str],
    matrix: dict,
    title: str,
    diagonal_green: bool = True,
    colorscale=None,
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
    width = max(300, cell_size * len(cols) + 150)

    fig.update_layout(
        title=title,
        margin=dict(l=10, r=10, t=40, b=10),
        height=height,
        width=width,
        xaxis=dict(title="Predicted", side="bottom", tickangle=-30),
        yaxis=dict(title="True", autorange="reversed"),
        plot_bgcolor="#f8f8f8",
    )
    return fig


def build_transition_figure(
    rows: list[str],
    cols: list[str],
    matrix: dict,
    run1_name: str,
    run2_name: str,
) -> go.Figure:
    """
    Build transition matrix heatmap.
    Color logic per cell:
      - green  if run2_correct > run1_correct  (run2 improved)
      - red    if run1_correct > run2_correct  (run2 regressed)
      - gray   if both_wrong == total          (both wrong)
      - white  if empty
    """
    z_color = []   # numeric score: +1=green, -1=red, 0=gray/empty
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
                row_text.append(f"{total:+d}" if net == 0 else f"{net:+d}")
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

    # Diverging colorscale: red=negative, gray=0, green=positive
    colorscale = [
        [0.0, "#cc3333"],
        [0.5, "#cccccc"],
        [1.0, "#33aa55"],
    ]

    z_arr = np.array(z_color, dtype=float)
    abs_max = max(1.0, float(np.abs(z_arr).max()))

    cell_size = max(40, min(80, 600 // max(len(rows), len(cols), 1)))
    height = max(300, cell_size * len(rows) + 120)
    width = max(300, cell_size * len(cols) + 150)

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
            showscale=True,
            colorbar=dict(title="Net delta", thickness=12),
            hovertemplate="%{customdata}<extra></extra>",
        )
    )

    fig.update_layout(
        title=f"Transition Matrix: {run1_name} → {run2_name}",
        margin=dict(l=10, r=10, t=40, b=10),
        height=height,
        width=width,
        xaxis=dict(title=f"Run2 Predicted ({run2_name})", side="bottom", tickangle=-30),
        yaxis=dict(title=f"Run1 Predicted ({run1_name})", autorange="reversed"),
    )
    return fig


def truncate_json(obj, max_chars: int = 200) -> str:
    s = json.dumps(obj, ensure_ascii=False)
    if len(s) > max_chars:
        return s[:max_chars] + "..."
    return s


def records_to_df(records: list[dict], two_run_mode: bool = False) -> pd.DataFrame:
    rows = []
    for r in records:
        row = {
            "record_id": r["record_id"],
            "true_type": r["true_type"],
            "pred_type": r["pred_type"],
            "true_subtype": r["true_subtype"],
            "pred_subtype": r["pred_subtype"],
            "attributes": truncate_json(r.get("attributes", {})),
            "metadata": truncate_json(r.get("metadata", {})),
        }
        if two_run_mode:
            row["run2_pred_type"] = r.get("run2_pred_type", "")
            row["run2_pred_subtype"] = r.get("run2_pred_subtype", "")
        rows.append(row)
    return pd.DataFrame(rows)


# ── Sidebar ───────────────────────────────────────────────────────────────────

st.sidebar.title("Classification Dashboard")
st.sidebar.markdown("---")

benchmarks = get_benchmarks()
benchmark_options = {b["name"]: b["id"] for b in benchmarks}
benchmark_names = list(benchmark_options.keys())

# Default to first benchmark
if st.session_state.selected_benchmark_id is None and benchmarks:
    st.session_state.selected_benchmark_id = benchmarks[0]["id"]

current_bname = next(
    (b["name"] for b in benchmarks if b["id"] == st.session_state.selected_benchmark_id),
    benchmark_names[0] if benchmark_names else None,
)

selected_benchmark_name = st.sidebar.selectbox(
    "Benchmark",
    options=benchmark_names,
    index=benchmark_names.index(current_bname) if current_bname in benchmark_names else 0,
)

new_benchmark_id = benchmark_options[selected_benchmark_name]
if new_benchmark_id != st.session_state.selected_benchmark_id:
    st.session_state.selected_benchmark_id = new_benchmark_id
    st.session_state.selected_run_ids = []
    reset_cells()
    st.rerun()

benchmark_id = st.session_state.selected_benchmark_id

st.sidebar.markdown("---")
st.sidebar.markdown("**Display options**")
incorrect_only = st.sidebar.checkbox(
    "Incorrect Only",
    value=st.session_state.incorrect_only,
    help="Show only misclassified records in confusion matrices",
    disabled=len(st.session_state.selected_run_ids) != 1,
)
if incorrect_only != st.session_state.incorrect_only:
    st.session_state.incorrect_only = incorrect_only
    reset_cells()

min_count = st.sidebar.number_input(
    "Min count (transition)",
    min_value=1,
    max_value=50,
    value=1,
    help="Minimum number of transitions to show in transition matrix",
)

# ── Leaderboard ───────────────────────────────────────────────────────────────

st.title("Classification Evaluation Dashboard")

leaderboard_rows = get_leaderboard(benchmark_id)
if not leaderboard_rows:
    st.warning("No runs found for this benchmark.")
    st.stop()

lb_df = pd.DataFrame(
    [
        {
            "run_id": r["run_id"],
            "run_name": r["run_name"],
            "model_name": r["model_version"],
            "subtype_accuracy": r["subtype_accuracy"],
            "subtype_f1_weighted": r["subtype_f1_weighted"],
            "benchmark_length": r["benchmark_length"],
        }
        for r in leaderboard_rows
    ]
)

st.subheader("Leaderboard")

display_df = lb_df.drop(columns=["run_id"]).copy()
display_df["subtype_accuracy"] = display_df["subtype_accuracy"].map("{:.4f}".format)
display_df["subtype_f1_weighted"] = display_df["subtype_f1_weighted"].map("{:.4f}".format)

st.dataframe(
    display_df,
    use_container_width=True,
    hide_index=True,
    height=min(300, 35 + 35 * len(display_df)),
)

# Run selection
all_run_names = lb_df["run_name"].tolist()
run_id_by_name = dict(zip(lb_df["run_name"], lb_df["run_id"]))

# Determine currently selected run names
current_selected_names = [
    row["run_name"]
    for row in leaderboard_rows
    if row["run_id"] in st.session_state.selected_run_ids
]

selected_names = st.multiselect(
    "Select runs for analysis (max 2)",
    options=all_run_names,
    default=current_selected_names,
    max_selections=2,
    help="Select 1 run for confusion matrix, 2 runs for transition matrix",
)

new_run_ids = [run_id_by_name[name] for name in selected_names]
if new_run_ids != st.session_state.selected_run_ids:
    st.session_state.selected_run_ids = new_run_ids
    reset_cells()
    st.rerun()

selected_run_ids = st.session_state.selected_run_ids

# ── Analysis panels ───────────────────────────────────────────────────────────

is_confusion_mode = len(selected_run_ids) == 1
is_transition_mode = len(selected_run_ids) == 2

if not selected_run_ids:
    st.info("Select one or two runs from the leaderboard to begin analysis.")
    st.stop()

if is_transition_mode:
    st.info(
        f"Transition mode: comparing **{selected_names[0]}** vs **{selected_names[1]}**. "
        "Only records where predictions differ are shown."
    )

st.markdown("---")

# ── Confusion Mode ────────────────────────────────────────────────────────────

if is_confusion_mode:
    run_id = selected_run_ids[0]
    run_name = selected_names[0]

    cm_data = get_confusion_matrix(run_id, incorrect_only=st.session_state.incorrect_only)
    type_matrix_info = cm_data["type_matrix"]

    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader(f"Type Confusion Matrix — {run_name}")
        if not type_matrix_info["rows"]:
            st.warning("No data.")
        else:
            fig_type = build_heatmap_figure(
                rows=type_matrix_info["rows"],
                cols=type_matrix_info["cols"],
                matrix=type_matrix_info["data"],
                title="Type-level (click cell to drill down)",
                diagonal_green=True,
            )
            type_event = st.plotly_chart(
                fig_type,
                on_select="rerun",
                selection_mode="points",
                key="type_matrix_chart",
                use_container_width=False,
            )

            # Handle click: read selected point
            if type_event and type_event.selection and type_event.selection.points:
                pt = type_event.selection.points[0]
                # Plotly heatmap: x=predicted (col), y=true (row)
                clicked_pred = pt.get("x")
                clicked_true = pt.get("y")
                if clicked_pred is not None and clicked_true is not None:
                    new_pair = {"true_type": clicked_true, "pred_type": clicked_pred}
                    if new_pair != st.session_state.selected_type_pair:
                        st.session_state.selected_type_pair = new_pair
                        st.session_state.selected_cell = None
                        st.rerun()

            # Show selected type pair indicator
            if st.session_state.selected_type_pair:
                tp = st.session_state.selected_type_pair
                st.caption(
                    f"Selected: True={tp['true_type']} → Pred={tp['pred_type']}. "
                    "Click another cell to change, or clear below."
                )
                if st.button("Clear type selection", key="clear_type"):
                    st.session_state.selected_type_pair = None
                    st.session_state.selected_cell = None
                    st.rerun()

    with col_right:
        st.subheader("Subtype Confusion Matrix")
        if st.session_state.selected_type_pair is None:
            st.info("Click a cell in the Type Confusion Matrix to drill down.")
        else:
            tp = st.session_state.selected_type_pair
            sub_matrix_info = get_subtype_matrix(
                run_id,
                tp["true_type"],
                tp["pred_type"],
                incorrect_only=st.session_state.incorrect_only,
            )
            if not sub_matrix_info["rows"]:
                st.warning("No subtype data for this cell.")
            else:
                fig_sub = build_heatmap_figure(
                    rows=sub_matrix_info["rows"],
                    cols=sub_matrix_info["cols"],
                    matrix=sub_matrix_info["data"],
                    title=f"Subtype: {tp['true_type']} → {tp['pred_type']}",
                    diagonal_green=True,
                )
                sub_event = st.plotly_chart(
                    fig_sub,
                    on_select="rerun",
                    selection_mode="points",
                    key="sub_matrix_chart",
                    use_container_width=False,
                )

                if sub_event and sub_event.selection and sub_event.selection.points:
                    pt = sub_event.selection.points[0]
                    clicked_pred_sub = pt.get("x")
                    clicked_true_sub = pt.get("y")
                    if clicked_pred_sub is not None and clicked_true_sub is not None:
                        new_cell = {
                            "true_subtype": clicked_true_sub,
                            "pred_subtype": clicked_pred_sub,
                        }
                        if new_cell != st.session_state.selected_cell:
                            st.session_state.selected_cell = new_cell
                            st.rerun()

                if st.session_state.selected_cell:
                    sc = st.session_state.selected_cell
                    st.caption(
                        f"Selected: True={sc['true_subtype']} → Pred={sc['pred_subtype']}"
                    )
                    if st.button("Clear subtype selection", key="clear_sub"):
                        st.session_state.selected_cell = None
                        st.rerun()

    # ── Record Details (single-run) ────────────────────────────────────────────

    st.markdown("---")
    st.subheader("Record Details")

    filters = {"run_id": run_id, "incorrect_only": st.session_state.incorrect_only}

    # Apply cell selections as filters
    if st.session_state.selected_cell:
        sc = st.session_state.selected_cell
        tp = st.session_state.selected_type_pair
        filters["true_subtype"] = sc["true_subtype"]
        filters["pred_subtype"] = sc["pred_subtype"]
        if tp:
            filters["true_type"] = tp["true_type"]
            filters["pred_type"] = tp["pred_type"]
    elif st.session_state.selected_type_pair:
        tp = st.session_state.selected_type_pair
        filters["true_type"] = tp["true_type"]
        filters["pred_type"] = tp["pred_type"]

    # Text filter inputs
    with st.expander("Filter records", expanded=False):
        f_col1, f_col2, f_col3, f_col4 = st.columns(4)
        with f_col1:
            f_true_type = st.text_input("True type", key="f_true_type")
        with f_col2:
            f_pred_type = st.text_input("Pred type", key="f_pred_type")
        with f_col3:
            f_true_sub = st.text_input("True subtype", key="f_true_sub")
        with f_col4:
            f_pred_sub = st.text_input("Pred subtype", key="f_pred_sub")

        if f_true_type:
            filters["true_type"] = f_true_type
        if f_pred_type:
            filters["pred_type"] = f_pred_type
        if f_true_sub:
            filters["true_subtype"] = f_true_sub
        if f_pred_sub:
            filters["pred_subtype"] = f_pred_sub

    row_height_choice = st.selectbox(
        "Row height",
        ["small", "medium", "large", "auto"],
        index=0,
        key="row_height_single",
    )
    height_map = {"small": 300, "medium": 500, "large": 800, "auto": None}
    table_height = height_map[row_height_choice]

    result = get_records(filters)
    records = result["data"]
    total = result["total"]

    st.caption(f"Showing {len(records)} of {total} records")

    if records:
        rec_df = records_to_df(records, two_run_mode=False)
        st.dataframe(
            rec_df,
            use_container_width=True,
            hide_index=True,
            height=table_height,
        )

        # Full JSON expander for a specific record
        st.markdown("**Inspect a record's full JSON**")
        rec_ids = [r["record_id"] for r in records]
        chosen_rec_id = st.selectbox("Record ID", options=rec_ids, key="inspect_rec_id")
        if chosen_rec_id:
            chosen_rec = next((r for r in records if r["record_id"] == chosen_rec_id), None)
            if chosen_rec:
                col_a, col_b = st.columns(2)
                with col_a:
                    with st.expander("Attributes (full JSON)", expanded=False):
                        st.json(chosen_rec.get("attributes", {}))
                with col_b:
                    with st.expander("Metadata (full JSON)", expanded=False):
                        st.json(chosen_rec.get("metadata", {}))
    else:
        st.info("No records match the current filters.")

# ── Transition Mode ───────────────────────────────────────────────────────────

elif is_transition_mode:
    run_id1, run_id2 = selected_run_ids[0], selected_run_ids[1]
    run_name1, run_name2 = selected_names[0], selected_names[1]

    tm_data = get_transition_matrix(run_id1, run_id2, min_count=int(min_count))

    if not tm_data["rows"]:
        st.warning("No transitions found between these two runs with the current min-count filter.")
    else:
        # Net delta summary
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

        m1, m2, m3 = st.columns(3)
        m1.metric("Run1 correct → Run2 wrong", total_r1c, delta=None)
        m2.metric("Run1 wrong → Run2 correct", total_r2c, delta=None)
        m3.metric(
            "Net delta (Run2 - Run1)",
            net_delta,
            delta=f"{net_delta:+d}",
            delta_color="normal",
        )

        st.subheader("Transition Matrix")

        fig_trans = build_transition_figure(
            rows=tm_data["rows"],
            cols=tm_data["cols"],
            matrix=tm_data["data"],
            run1_name=run_name1,
            run2_name=run_name2,
        )
        trans_event = st.plotly_chart(
            fig_trans,
            on_select="rerun",
            selection_mode="points",
            key="transition_chart",
            use_container_width=False,
        )

        if trans_event and trans_event.selection and trans_event.selection.points:
            pt = trans_event.selection.points[0]
            clicked_r2 = pt.get("x")
            clicked_r1 = pt.get("y")
            if clicked_r1 is not None and clicked_r2 is not None:
                new_tc = {"run1_pred": clicked_r1, "run2_pred": clicked_r2}
                if new_tc != st.session_state.selected_transition_cell:
                    st.session_state.selected_transition_cell = new_tc
                    st.rerun()

        if st.session_state.selected_transition_cell:
            tc = st.session_state.selected_transition_cell
            st.caption(
                f"Selected transition: Run1 pred={tc['run1_pred']} → Run2 pred={tc['run2_pred']}"
            )
            if st.button("Clear transition selection", key="clear_trans"):
                st.session_state.selected_transition_cell = None
                st.rerun()

    # ── Record Details (two-run) ───────────────────────────────────────────────

    st.markdown("---")
    st.subheader("Record Details")

    filters2 = {
        "run_id1": run_id1,
        "run_id2": run_id2,
    }

    if st.session_state.selected_transition_cell:
        tc = st.session_state.selected_transition_cell
        filters2["run1_pred_subtype"] = tc["run1_pred"]
        filters2["run2_pred_subtype"] = tc["run2_pred"]

    with st.expander("Filter records", expanded=False):
        f2_col1, f2_col2 = st.columns(2)
        with f2_col1:
            f2_run1_pred = st.text_input("Run1 pred subtype", key="f2_run1_pred")
        with f2_col2:
            f2_run2_pred = st.text_input("Run2 pred subtype", key="f2_run2_pred")

        if f2_run1_pred:
            filters2["run1_pred_subtype"] = f2_run1_pred
        if f2_run2_pred:
            filters2["run2_pred_subtype"] = f2_run2_pred

    row_height_choice2 = st.selectbox(
        "Row height",
        ["small", "medium", "large", "auto"],
        index=0,
        key="row_height_trans",
    )
    height_map2 = {"small": 300, "medium": 500, "large": 800, "auto": None}
    table_height2 = height_map2[row_height_choice2]

    result2 = get_records(filters2)
    records2 = result2["data"]
    total2 = result2["total"]

    st.caption(f"Showing {len(records2)} of {total2} records (where predictions differ)")

    if records2:
        rec_df2 = records_to_df(records2, two_run_mode=True)
        st.dataframe(
            rec_df2,
            use_container_width=True,
            hide_index=True,
            height=table_height2,
        )

        # Full JSON expander
        st.markdown("**Inspect a record's full JSON**")
        rec_ids2 = [r["record_id"] for r in records2]
        chosen_rec_id2 = st.selectbox("Record ID", options=rec_ids2, key="inspect_rec_id2")
        if chosen_rec_id2:
            chosen_rec2 = next((r for r in records2 if r["record_id"] == chosen_rec_id2), None)
            if chosen_rec2:
                col_a2, col_b2 = st.columns(2)
                with col_a2:
                    with st.expander("Attributes (full JSON)", expanded=False):
                        st.json(chosen_rec2.get("attributes", {}))
                with col_b2:
                    with st.expander("Metadata (full JSON)", expanded=False):
                        st.json(chosen_rec2.get("metadata", {}))
    else:
        st.info("No records match the current filters.")
