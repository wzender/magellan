"""Data loader for Dash app (CSV primary, Postgres stub)."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import pandas as pd
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
PY_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
RUNS_DIR = DATA_DIR / "runs"

# Prefer python/.env when running the Dash app. Use override=True so a
# previously exported DATA_SOURCE from another shell context cannot force the
# unimplemented Postgres path.
load_dotenv(PY_DIR / ".env", override=True)
load_dotenv(ROOT_DIR / ".env", override=False)


def sanitize_run_name(name: str) -> str:
    """Match Node CSV sanitizer for run file naming."""
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9_-]", "_", name.lower().strip()))


def run_file_path(benchmark_id: int, run_name: str) -> Path:
    return RUNS_DIR / f"{benchmark_id}_{sanitize_run_name(run_name)}.csv"


def _parse_json_cell(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, float) and pd.isna(value):
        return {}
    text = str(value).strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


class CSVLoader:
    """In-memory CSV loader aligned with the Node app behavior."""

    def __init__(self) -> None:
        self._leaderboard_df = pd.read_csv(DATA_DIR / "leaderboard.csv")
        self._leaderboard_df = self._leaderboard_df.reset_index(drop=True)
        self._leaderboard_df["run_id"] = self._leaderboard_df.index + 1
        self._run_cache: dict[int, pd.DataFrame] = {}

        for row in self._leaderboard_df.to_dict("records"):
            run_id = int(row["run_id"])
            benchmark_id = int(row["benchmark_id"])
            run_name = str(row["run_name"])
            path = run_file_path(benchmark_id, run_name)
            if not path.exists():
                print(f"Warning: missing run file: {path.name}")
                self._run_cache[run_id] = pd.DataFrame(
                    columns=[
                        "record_id",
                        "true_type",
                        "true_subtype",
                        "pred_type",
                        "pred_subtype",
                        "attributes",
                        "metadata",
                    ]
                )
                continue

            run_df = pd.read_csv(path)
            if "rec_id" in run_df.columns:
                run_df = run_df.rename(columns={"rec_id": "record_id"})

            # Parse JSON fields at load time to keep downstream logic simple.
            for col in ("attributes", "metadata"):
                if col in run_df.columns:
                    run_df[col] = run_df[col].apply(_parse_json_cell)
                else:
                    run_df[col] = [{} for _ in range(len(run_df))]

            needed = [
                "record_id",
                "true_type",
                "true_subtype",
                "pred_type",
                "pred_subtype",
                "attributes",
                "metadata",
            ]
            for col in needed:
                if col not in run_df.columns:
                    run_df[col] = ""
            self._run_cache[run_id] = run_df[needed].copy()

    def get_benchmarks(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        seen: set[int] = set()
        for row in self._leaderboard_df[["benchmark_id", "benchmark_name"]].to_dict("records"):
            bid = int(row["benchmark_id"])
            if bid not in seen:
                seen.add(bid)
                out.append({"id": bid, "name": row["benchmark_name"]})
        return out

    def get_runs_by_benchmark_id(self, benchmark_id: int) -> list[dict[str, Any]]:
        df = self._leaderboard_df[self._leaderboard_df["benchmark_id"] == benchmark_id]
        return [
            {
                "id": int(r["run_id"]),
                "benchmark_id": int(r["benchmark_id"]),
                "run_name": str(r["run_name"]),
                "model_version": str(r.get("model_name", "")),
            }
            for r in df.to_dict("records")
        ]

    def get_run(self, run_id: int) -> dict[str, Any] | None:
        row = self._leaderboard_df[self._leaderboard_df["run_id"] == run_id]
        if row.empty:
            return None
        r = row.iloc[0]
        return {
            "id": int(r["run_id"]),
            "benchmark_id": int(r["benchmark_id"]),
            "run_name": str(r["run_name"]),
            "model_version": str(r.get("model_name", "")),
        }

    def get_leaderboard(self, benchmark_id: int) -> list[dict[str, Any]]:
        df = self._leaderboard_df[self._leaderboard_df["benchmark_id"] == benchmark_id].copy()
        if df.empty:
            return []

        rows: list[dict[str, Any]] = []
        for r in df.to_dict("records"):
            run_id = int(r["run_id"])
            benchmark_length = len(self._run_cache.get(run_id, []))
            rows.append(
                {
                    "run_id": run_id,
                    "run_name": str(r["run_name"]),
                    "model_version": str(r.get("model_name", "")),
                    "subtype_accuracy": float(r.get("subtype_accuracy", 0) or 0),
                    "subtype_f1_weighted": float(r.get("subtype_f1_weighted", 0) or 0),
                    "type_f1_weighted": float(r.get("type_f1_weighted", "nan") or float("nan")) if "type_f1_weighted" in r else float("nan"),
                    "benchmark_length": int(benchmark_length),
                    "run_date": r.get("run_date"),
                }
            )

        rows.sort(key=lambda x: x["subtype_f1_weighted"], reverse=True)
        return rows

    def get_run_records(self, run_id: int) -> pd.DataFrame:
        if run_id not in self._run_cache:
            return pd.DataFrame(
                columns=[
                    "record_id",
                    "true_type",
                    "true_subtype",
                    "pred_type",
                    "pred_subtype",
                    "attributes",
                    "metadata",
                ]
            )
        return self._run_cache[run_id].copy()


class PostgresLoader:
    """Interface-compatible placeholder for future Postgres support."""

    def get_benchmarks(self) -> list[dict[str, Any]]:
        raise NotImplementedError("PostgresLoader is not implemented yet")

    def get_runs_by_benchmark_id(self, benchmark_id: int) -> list[dict[str, Any]]:
        raise NotImplementedError("PostgresLoader is not implemented yet")

    def get_run(self, run_id: int) -> dict[str, Any] | None:
        raise NotImplementedError("PostgresLoader is not implemented yet")

    def get_leaderboard(self, benchmark_id: int) -> list[dict[str, Any]]:
        raise NotImplementedError("PostgresLoader is not implemented yet")

    def get_run_records(self, run_id: int) -> pd.DataFrame:
        raise NotImplementedError("PostgresLoader is not implemented yet")


DATA_SOURCE = os.getenv("DATA_SOURCE", "csv").strip().lower()
if DATA_SOURCE == "postgres":
    print("Warning: PostgresLoader is not implemented yet; falling back to CSVLoader.")
    loader: CSVLoader | PostgresLoader = CSVLoader()
else:
    loader = CSVLoader()

