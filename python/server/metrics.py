"""Metrics and matrix computation helpers for Dash callbacks."""

from __future__ import annotations

import math
from collections import Counter
from typing import Any

import pandas as pd

from server.loader import loader


def compute_f1(matrix_data: dict[str, dict[str, int]], label: str, rows: list[str], cols: list[str]) -> dict[str, float] | None:
    tp = int(matrix_data.get(label, {}).get(label, 0))
    fn = sum(int(matrix_data.get(label, {}).get(c, 0)) for c in cols if c != label)
    fp = sum(int(matrix_data.get(r, {}).get(label, 0)) for r in rows if r != label)
    denom = tp + fp + fn
    if denom == 0:
        return None

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    if precision + recall == 0:
        f1 = 0.0
    else:
        f1 = 2 * precision * recall / (precision + recall)
    return {"f1": f1, "precision": precision, "recall": recall}


def sort_labels_by_f1(labels: list[str], matrix_data: dict[str, dict[str, int]]) -> list[str]:
    def key_fn(lbl: str) -> tuple[int, float, str]:
        m = compute_f1(matrix_data, lbl, labels, labels)
        if m is None:
            return (1, -1.0, lbl)
        return (0, -m["f1"], lbl)

    return sorted(labels, key=key_fn)


def _build_matrix(rows: pd.DataFrame, true_col: str, pred_col: str, labels: list[str]) -> dict[str, dict[str, int]]:
    matrix = {t: {p: 0 for p in labels} for t in labels}
    for r in rows[[true_col, pred_col]].to_dict("records"):
        matrix[str(r[true_col])][str(r[pred_col])] += 1
    return matrix


def get_confusion_matrix(run_id: int, incorrect_only: bool = False) -> dict[str, Any]:
    records = loader.get_run_records(run_id)
    if incorrect_only:
        records = records[records["pred_subtype"] != records["true_subtype"]]

    if records.empty:
        return {
            "type_matrix": {"rows": [], "cols": [], "data": {}},
            "subtype_matrix": [],
        }

    type_labels = sorted(set(records["true_type"]).union(set(records["pred_type"])))
    type_data = _build_matrix(records, "true_type", "pred_type", type_labels)
    sorted_types = sort_labels_by_f1(type_labels, type_data)

    grouped = (
        records.groupby(["true_type", "pred_type", "true_subtype", "pred_subtype"], dropna=False)
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
    )
    subtype_matrix = grouped.to_dict("records")

    return {
        "type_matrix": {"rows": sorted_types, "cols": sorted_types, "data": type_data},
        "subtype_matrix": subtype_matrix,
    }


def get_subtype_matrix(run_id: int, true_type: str, pred_type: str, incorrect_only: bool = False) -> dict[str, Any]:
    records = loader.get_run_records(run_id)
    records = records[(records["true_type"] == true_type) & (records["pred_type"] == pred_type)]
    if incorrect_only:
        records = records[records["pred_subtype"] != records["true_subtype"]]
    if records.empty:
        return {"rows": [], "cols": [], "data": {}}

    labels = sorted(set(records["true_subtype"]).union(set(records["pred_subtype"])))
    data = _build_matrix(records, "true_subtype", "pred_subtype", labels)

    row_labels = sort_labels_by_f1(labels, data)
    shared = [x for x in row_labels if x in labels]
    remaining = [x for x in labels if x not in shared]
    remaining_sorted = sort_labels_by_f1(remaining, data) if remaining else []
    col_labels = shared + [x for x in remaining_sorted if x not in shared]

    non_empty_rows = [r for r in row_labels if sum(data.get(r, {}).values()) > 0]
    referenced_cols = {c for r in non_empty_rows for c, v in data.get(r, {}).items() if v > 0}
    non_empty_cols = [c for c in col_labels if c in referenced_cols or c in non_empty_rows]

    return {"rows": non_empty_rows, "cols": non_empty_cols, "data": data}


def get_transition_matrix(run_id1: int, run_id2: int, min_count: int = 1) -> dict[str, Any]:
    run1 = loader.get_run_records(run_id1).copy()
    run2 = loader.get_run_records(run_id2).copy()
    if run1.empty or run2.empty:
        return {"rows": [], "cols": [], "data": {}}

    run1 = run1.rename(columns={"pred_type": "run1_pred_type", "pred_subtype": "run1_pred_subtype"})
    run2 = run2.rename(columns={"pred_type": "run2_pred_type", "pred_subtype": "run2_pred_subtype"})
    merged = run1[["record_id", "true_subtype", "run1_pred_subtype", "run1_pred_type"]].merge(
        run2[["record_id", "run2_pred_subtype", "run2_pred_type"]], on="record_id", how="inner"
    )
    changed = merged[merged["run1_pred_subtype"] != merged["run2_pred_subtype"]]
    if changed.empty:
        return {"rows": [], "cols": [], "data": {}}

    cells: dict[str, dict[str, dict[str, int]]] = {}
    for r in changed.to_dict("records"):
        p1 = str(r["run1_pred_subtype"])
        p2 = str(r["run2_pred_subtype"])
        truth = str(r["true_subtype"])
        if p1 not in cells:
            cells[p1] = {}
        if p2 not in cells[p1]:
            cells[p1][p2] = {"total": 0, "run1_correct": 0, "run2_correct": 0, "both_wrong": 0}
        cell = cells[p1][p2]
        cell["total"] += 1
        r1_correct = p1 == truth
        r2_correct = p2 == truth
        if r1_correct and not r2_correct:
            cell["run1_correct"] += 1
        elif r2_correct and not r1_correct:
            cell["run2_correct"] += 1
        elif not r1_correct and not r2_correct:
            cell["both_wrong"] += 1

    filtered: dict[str, dict[str, dict[str, int]]] = {}
    labels: set[str] = set()
    for p1, cols in cells.items():
        for p2, stats in cols.items():
            if stats["total"] >= max(1, int(min_count)):
                filtered.setdefault(p1, {})[p2] = stats
                labels.add(p1)
                labels.add(p2)

    ordered = sorted(labels)
    return {"rows": ordered, "cols": ordered, "data": filtered}


def _paginate(rows: list[dict[str, Any]], limit: int, offset: int) -> dict[str, Any]:
    total = len(rows)
    limit = max(1, int(limit))
    offset = max(0, int(offset))
    pages = math.ceil(total / limit) if total else 0
    return {
        "data": rows[offset: offset + limit],
        "pagination": {"total": total, "limit": limit, "offset": offset, "pages": pages},
    }


def get_records(filters: dict[str, Any]) -> dict[str, Any]:
    limit = filters.get("limit", 100)
    offset = filters.get("offset", 0)

    run_id2 = filters.get("run_id2")
    if run_id2:
        run_id1 = int(filters.get("run_id1") or filters.get("run_id"))
        run1 = loader.get_run_records(run_id1).copy()
        run2 = loader.get_run_records(int(run_id2)).copy()
        if run1.empty or run2.empty:
            return _paginate([], limit, offset)

        r1 = run1.rename(columns={"pred_type": "pred_type", "pred_subtype": "pred_subtype"})
        r2 = run2.rename(columns={"pred_type": "run2_pred_type", "pred_subtype": "run2_pred_subtype"})
        merged = r1.merge(
            r2[["record_id", "run2_pred_type", "run2_pred_subtype"]], on="record_id", how="inner"
        )
        merged = merged[merged["pred_subtype"] != merged["run2_pred_subtype"]]

        if filters.get("run1_pred_subtype"):
            merged = merged[merged["pred_subtype"] == filters["run1_pred_subtype"]]
        if filters.get("run2_pred_subtype"):
            merged = merged[merged["run2_pred_subtype"] == filters["run2_pred_subtype"]]
        if filters.get("true_type"):
            merged = merged[merged["true_type"] == filters["true_type"]]
        if filters.get("pred_type"):
            merged = merged[merged["pred_type"] == filters["pred_type"]]

        return _paginate(merged.to_dict("records"), limit, offset)

    run_id = filters.get("run_id")
    rows_df = loader.get_run_records(int(run_id)) if run_id else pd.DataFrame()
    if rows_df.empty:
        return _paginate([], limit, offset)

    if filters.get("true_type"):
        rows_df = rows_df[rows_df["true_type"] == filters["true_type"]]
    if filters.get("pred_type"):
        rows_df = rows_df[rows_df["pred_type"] == filters["pred_type"]]
    if filters.get("true_subtype"):
        rows_df = rows_df[rows_df["true_subtype"] == filters["true_subtype"]]
    if filters.get("pred_subtype"):
        rows_df = rows_df[rows_df["pred_subtype"] == filters["pred_subtype"]]
    if filters.get("incorrect_only") or filters.get("incorrectOnly"):
        rows_df = rows_df[rows_df["pred_subtype"] != rows_df["true_subtype"]]

    return _paginate(rows_df.to_dict("records"), limit, offset)

