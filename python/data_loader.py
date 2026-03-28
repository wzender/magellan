"""
Data loader for the classification evaluation dashboard.
Mirrors the logic of server/csv-loader.js.
"""

import os
import re
import json
import pandas as pd
import streamlit as st

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
RUNS_DIR = os.path.join(DATA_DIR, "runs")


def sanitize(name: str) -> str:
    """Lowercase, spaces->_, keep [a-z0-9_-], strip leading/trailing underscores."""
    name = name.lower().strip()
    name = re.sub(r"[^a-z0-9_-]", "_", name)
    name = re.sub(r"^_+|_+$", "", name)
    return name


def run_file_name(benchmark_id: int, run_name: str) -> str:
    return f"{benchmark_id}_{sanitize(run_name)}.csv"


@st.cache_data(show_spinner="Loading data...")
def load_data() -> dict:
    """
    Load leaderboard.csv and all per-run CSVs into memory.
    Returns a dict with keys: benchmarks, runs, leaderboard, run_results.
    """
    lb_path = os.path.join(DATA_DIR, "leaderboard.csv")
    lb_df = pd.read_csv(lb_path)

    benchmarks = []
    seen_benchmarks = set()
    runs = []
    leaderboard = []

    for i, row in lb_df.iterrows():
        run_id = i + 1  # 1-based index matching the row position
        benchmark_id = int(row["benchmark_id"])
        benchmark_name = row["benchmark_name"]

        if benchmark_id not in seen_benchmarks:
            seen_benchmarks.add(benchmark_id)
            benchmarks.append({"id": benchmark_id, "name": benchmark_name})

        runs.append(
            {
                "id": run_id,
                "benchmark_id": benchmark_id,
                "run_name": row["run_name"],
                "model_version": row["model_name"],
            }
        )

        leaderboard.append(
            {
                "id": run_id,
                "run_id": run_id,
                "benchmark_id": benchmark_id,
                "run_name": row["run_name"],
                "model_version": row["model_name"],
                "subtype_accuracy": float(row["subtype_accuracy"]),
                "subtype_f1_weighted": float(row["subtype_f1_weighted"]),
                "benchmark_length": 0,
            }
        )

    # Re-index leaderboard by run_id for quick lookup
    lb_by_run_id = {entry["run_id"]: entry for entry in leaderboard}

    run_results = []
    for run in runs:
        fname = run_file_name(run["benchmark_id"], run["run_name"])
        fpath = os.path.join(RUNS_DIR, fname)
        if not os.path.exists(fpath):
            print(f"Warning: Missing run file: {fname}")
            continue

        records_df = pd.read_csv(fpath)

        lb_entry = lb_by_run_id.get(run["id"])
        if lb_entry is not None:
            lb_entry["benchmark_length"] = len(records_df)

        for idx, r in records_df.iterrows():
            # Parse JSON fields
            attrs = r.get("attributes", "{}")
            meta = r.get("metadata", "{}")
            if isinstance(attrs, str):
                try:
                    attrs = json.loads(attrs)
                except (json.JSONDecodeError, ValueError):
                    attrs = {}
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except (json.JSONDecodeError, ValueError):
                    meta = {}

            run_results.append(
                {
                    "id": run["id"] * 100000 + idx,
                    "run_id": run["id"],
                    "record_id": r["rec_id"],
                    "true_type": r["true_type"],
                    "true_subtype": r["true_subtype"],
                    "pred_type": r["pred_type"],
                    "pred_subtype": r["pred_subtype"],
                    "attributes": attrs,
                    "metadata": meta,
                }
            )

    return {
        "benchmarks": benchmarks,
        "runs": runs,
        "leaderboard": leaderboard,
        "run_results": run_results,
    }


# ── Query functions ────────────────────────────────────────────────────────────


def get_benchmarks() -> list[dict]:
    return load_data()["benchmarks"]


def get_leaderboard(benchmark_id: int) -> list[dict]:
    data = load_data()
    rows = [l for l in data["leaderboard"] if l["benchmark_id"] == benchmark_id]
    rows.sort(key=lambda x: x["subtype_f1_weighted"], reverse=True)
    return rows


def get_confusion_matrix(run_id: int, incorrect_only: bool = False) -> dict:
    """
    Returns type-level confusion matrix and subtype-level data.
    """
    data = load_data()
    results = [r for r in data["run_results"] if r["run_id"] == run_id]
    if incorrect_only:
        results = [r for r in results if r["pred_subtype"] != r["true_subtype"]]

    # Collect all types
    types = sorted(
        set(r["true_type"] for r in results) | set(r["pred_type"] for r in results)
    )

    # Build type matrix
    type_matrix = {t: {p: 0 for p in types} for t in types}
    for r in results:
        type_matrix[r["true_type"]][r["pred_type"]] += 1

    # Build subtype pair data
    seen_pairs = set()
    subtype_data = []
    for r in results:
        key = (r["true_type"], r["pred_type"], r["true_subtype"], r["pred_subtype"])
        if key not in seen_pairs:
            seen_pairs.add(key)
            count = sum(
                1
                for x in results
                if x["true_type"] == r["true_type"]
                and x["pred_type"] == r["pred_type"]
                and x["true_subtype"] == r["true_subtype"]
                and x["pred_subtype"] == r["pred_subtype"]
            )
            subtype_data.append(
                {
                    "true_type": r["true_type"],
                    "pred_type": r["pred_type"],
                    "true_subtype": r["true_subtype"],
                    "pred_subtype": r["pred_subtype"],
                    "count": count,
                }
            )

    subtype_data.sort(key=lambda x: x["count"], reverse=True)

    return {
        "type_matrix": {"rows": types, "cols": types, "data": type_matrix},
        "subtype_matrix": subtype_data,
    }


def get_subtype_matrix(
    run_id: int, true_type: str, pred_type: str, incorrect_only: bool = False
) -> dict:
    """
    Returns subtype-level confusion matrix for a specific type pair.
    """
    data = load_data()
    results = [
        r
        for r in data["run_results"]
        if r["run_id"] == run_id
        and r["true_type"] == true_type
        and r["pred_type"] == pred_type
    ]
    if incorrect_only:
        results = [r for r in results if r["pred_subtype"] != r["true_subtype"]]

    subtypes = sorted(
        set(r["true_subtype"] for r in results)
        | set(r["pred_subtype"] for r in results)
    )

    matrix_data = {t: {p: 0 for p in subtypes} for t in subtypes}
    for r in results:
        matrix_data[r["true_subtype"]][r["pred_subtype"]] += 1

    return {"rows": subtypes, "cols": subtypes, "data": matrix_data}


def get_transition_matrix(run_id1: int, run_id2: int, min_count: int = 1) -> dict:
    """
    Returns subtype-level transition matrix between two runs.
    Only includes records where predictions differ.
    """
    data = load_data()

    run1_map = {}
    for r in data["run_results"]:
        if r["run_id"] == run_id1:
            run1_map[r["record_id"]] = {
                "pred_subtype": r["pred_subtype"],
                "true_subtype": r["true_subtype"],
            }

    transition_data = {}
    for r in data["run_results"]:
        if r["run_id"] != run_id2:
            continue
        r1 = run1_map.get(r["record_id"])
        if r1 is None or r1["pred_subtype"] == r["pred_subtype"]:
            continue

        run1_pred = r1["pred_subtype"]
        run2_pred = r["pred_subtype"]
        true_subtype = r1["true_subtype"]

        if run1_pred not in transition_data:
            transition_data[run1_pred] = {}
        if run2_pred not in transition_data[run1_pred]:
            transition_data[run1_pred][run2_pred] = {
                "total": 0,
                "run1_correct": 0,
                "run2_correct": 0,
                "both_wrong": 0,
            }

        cell = transition_data[run1_pred][run2_pred]
        cell["total"] += 1
        r1c = run1_pred == true_subtype
        r2c = run2_pred == true_subtype
        if r1c and not r2c:
            cell["run1_correct"] += 1
        elif not r1c and r2c:
            cell["run2_correct"] += 1
        elif not r1c and not r2c:
            cell["both_wrong"] += 1

    # Filter by min_count
    filtered_data = {}
    filtered_subtypes = set()
    for r1_pred, r2_preds in transition_data.items():
        for r2_pred, cell in r2_preds.items():
            if cell["total"] >= min_count:
                if r1_pred not in filtered_data:
                    filtered_data[r1_pred] = {}
                filtered_data[r1_pred][r2_pred] = cell
                filtered_subtypes.add(r1_pred)
                filtered_subtypes.add(r2_pred)

    subtype_array = sorted(filtered_subtypes)
    return {"rows": subtype_array, "cols": subtype_array, "data": filtered_data}


def get_records(filters: dict) -> dict:
    """
    Returns filtered records with pagination.
    Mirrors getRecords() from csv-loader.js.
    """
    data = load_data()

    limit = filters.get("limit", 500)
    offset = filters.get("offset", 0)

    if filters.get("run_id2"):
        run_id1 = filters.get("run_id1") or filters.get("run_id")
        run_id2 = filters["run_id2"]

        run2_map = {}
        for r in data["run_results"]:
            if r["run_id"] == run_id2:
                run2_map[r["record_id"]] = r

        combined = []
        for r1 in data["run_results"]:
            if r1["run_id"] != run_id1:
                continue
            r2 = run2_map.get(r1["record_id"])
            if r2 is None:
                continue
            # Only include records where predictions differ
            if r1["pred_subtype"] == r2["pred_subtype"]:
                continue
            row = dict(r1)
            row["run2_pred_type"] = r2["pred_type"]
            row["run2_pred_subtype"] = r2["pred_subtype"]
            combined.append(row)

        if filters.get("run1_pred_subtype"):
            combined = [r for r in combined if r["pred_subtype"] == filters["run1_pred_subtype"]]
        if filters.get("run2_pred_subtype"):
            combined = [r for r in combined if r["run2_pred_subtype"] == filters["run2_pred_subtype"]]
        if filters.get("true_type"):
            combined = [r for r in combined if r["true_type"] == filters["true_type"]]
        if filters.get("pred_type"):
            combined = [r for r in combined if r["pred_type"] == filters["pred_type"]]

        total = len(combined)
        return {
            "data": combined[offset : offset + limit],
            "total": total,
        }

    results = list(data["run_results"])
    if filters.get("run_id"):
        results = [r for r in results if r["run_id"] == filters["run_id"]]
    if filters.get("true_type"):
        results = [r for r in results if r["true_type"] == filters["true_type"]]
    if filters.get("pred_type"):
        results = [r for r in results if r["pred_type"] == filters["pred_type"]]
    if filters.get("true_subtype"):
        results = [r for r in results if r["true_subtype"] == filters["true_subtype"]]
    if filters.get("pred_subtype"):
        results = [r for r in results if r["pred_subtype"] == filters["pred_subtype"]]
    if filters.get("incorrect_only"):
        results = [r for r in results if r["pred_subtype"] != r["true_subtype"]]

    total = len(results)
    return {
        "data": results[offset : offset + limit],
        "total": total,
    }
